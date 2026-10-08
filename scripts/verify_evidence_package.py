#!/usr/bin/env python3
"""证据包离线核验参考脚本（仅标准库）。

用法：
    python3 verify_evidence_package.py 证据包_XXX.zip [--feishu-json <节点uuid>=<消息文件> ...] \
        [--feishu-next-json <节点uuid>=<其后继节点的消息文件> ...] \
        [--feishu-app-id cli_xxx --feishu-app-secret xxx] [--json 报告.json]

给了飞书自建应用凭证（或环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET）时，脚本直连 open.feishu.cn，按节点文件里的
feishu_msg_id / next_node.feishu_msg_id 拉取群消息并比对，同时核对飞书记录的发送时间与上链时间（±5 分钟）。
该应用的机器人须已加入存证群并开通 im:message:readonly（群消息还需 im:message.group_msg）。

与核验站核验库算法一致，分四步输出每条检查：[通过] / [失败] / [提示] / [跳过]。
退出码：0 没有失败项；1 存在失败项；2 参数或证据包格式错误。
格式契约见本仓库 docs/evidence_package_format.md。要求 Python 3.8 及以上（macOS / 主流 Linux 自带即可）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys
import urllib.error
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

FORMAT_VERSION = 1
STATUS_TEXT = {'pass': '通过', 'fail': '失败', 'warn': '提示', 'skip': '跳过'}
PHASE_RULES = {('driver_sign', 1, 4), ('driver_sign', 2, 5), ('driver_relay', 3, 6)}
WINDOW_TOLERANCE = timedelta(seconds=60)
ANCHOR_TIME_TOLERANCE = timedelta(minutes=5)
CHAIN_TZ = timezone(timedelta(hours=8))  # 服务端上链时间按北京时间记录
FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'


def check(step: int, check_id: str, title: str, status: str, detail: str = '') -> dict:
    return {'step': step, 'id': check_id, 'title': title, 'status': status, 'detail': detail}


def load_package(path: str) -> tuple[dict, list[dict], dict[str, bytes]]:
    try:
        archive = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as exc:
        raise SystemExit(f'无法打开证据包: {exc}')
    names = set(archive.namelist())
    if 'manifest.json' not in names:
        raise SystemExit('不是证据包：zip 根目录没有 manifest.json')
    manifest = json.loads(archive.read('manifest.json'))
    if manifest.get('format_version') != FORMAT_VERSION:
        raise SystemExit(f'不支持的证据包版本 format_version {manifest.get("format_version")}')
    nodes = []
    for item in manifest['nodes']:
        if item['path'] not in names:
            raise SystemExit(f'清单引用的节点文件不存在：{item["path"]}')
        nodes.append(json.loads(archive.read(item['path'])))
    files = {name: archive.read(name) for name in names if name.startswith('files/')}
    return manifest, nodes, files


def payload_of(node: dict) -> dict | None:
    try:
        data = json.loads(node['data'])
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def parse_time(text: str | None) -> datetime | None:
    if not text:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S'):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


# --- step1 ---
def node_signature(node: dict) -> str:
    """节点哈希 = SHA-512(uuid + created_at + prev_signature + data)，四段原样拼接，data 绝不重新序列化。"""
    raw = f"{node['uuid']}{node['created_at']}{node.get('prev_signature') or ''}{node['data']}"
    return hashlib.sha512(raw.encode('utf-8')).hexdigest()


def verify_nodes(nodes: list[dict]) -> list[dict]:
    checks = []
    by_signature = {node['signature']: node for node in nodes}
    by_uuid = {node['uuid']: node for node in nodes}
    for node in nodes:
        actual = node_signature(node)
        ok = actual == node['signature']
        checks.append(check(1, f"node.hash.{node['uuid']}", '节点哈希重算', 'pass' if ok else 'fail', '重算一致' if ok else f'重算 {actual[:16]}… ≠ 记录 {node["signature"][:16]}…'))
        prev = node.get('prev_signature') or ''
        if not prev:
            checks.append(check(1, f"node.link.adjacent.{node['uuid']}", '前驱链接', 'pass', '全链首节点，前驱哈希为空'))
        elif prev in by_signature:
            checks.append(check(1, f"node.link.adjacent.{node['uuid']}", '前驱链接', 'pass', f'前驱 {by_signature[prev]["uuid"]} 在包内且哈希一致'))
        else:
            checks.append(check(1, f"node.link.adjacent.{node['uuid']}", '前驱链接', 'skip', '前驱属于其他运单，仅凭其哈希参与重算'))
        nxt = node.get('next_node')
        if not nxt:
            checks.append(check(1, f"node.link.next.{node['uuid']}", '后继线索', 'skip', '链尾，无后继'))
        elif nxt['uuid'] in by_uuid:
            ok = by_uuid[nxt['uuid']].get('prev_signature') == node['signature']
            checks.append(check(1, f"node.link.next.{node['uuid']}", '后继线索', 'pass' if ok else 'fail', '后继在包内并引用了本节点' if ok else '后继在包内但未引用本节点'))
        else:
            feishu = f'飞书消息 id {nxt["feishu_msg_id"]}' if nxt.get('feishu_msg_id') else '其飞书消息'
            checks.append(check(1, f"node.link.next.{node['uuid']}", '后继线索', 'skip', f'后继 {nxt["uuid"]} 属于其他运单，包内不可重算；可凭{feishu} 索取后继的群消息，用 --feishu-next-json 比对'))
    ordered = sorted(nodes, key=lambda item: item['id'])
    monotonic = all(ordered[i - 1]['created_at'] <= ordered[i]['created_at'] for i in range(1, len(ordered)))
    checks.append(check(1, 'node.order.created_at', '上链时间顺序', 'pass' if monotonic else 'warn', '按链上顺序单调不减' if monotonic else '存在上链时间倒退的节点'))
    return checks


# --- step2 ---
def read_user_comment(jpeg: bytes) -> dict | None:
    """读 JPEG APP1 Exif 的 UserComment（0x9286）记录；hmac 字段剔除——第三方无法复算，不读不算不展示。"""
    if len(jpeg) < 4 or jpeg[:2] != b'\xff\xd8':
        return None
    offset = 2
    tiff = None
    while offset + 4 <= len(jpeg) and jpeg[offset] == 0xFF:
        marker = jpeg[offset + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            offset += 2
            continue
        if marker in (0xDA, 0xD9):
            break
        length = struct.unpack('>H', jpeg[offset + 2:offset + 4])[0]
        if marker == 0xE1 and jpeg[offset + 4:offset + 10] == b'Exif\x00\x00':
            tiff = jpeg[offset + 10:offset + 2 + length]
            break
        offset += 2 + length
    if not tiff or len(tiff) < 8 or tiff[:2] not in (b'II', b'MM'):
        return None
    endian = '<' if tiff[:2] == b'II' else '>'
    sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8}

    def read_ifd(start: int, wanted: int):
        count = struct.unpack(endian + 'H', tiff[start:start + 2])[0]
        for index in range(count):
            entry = start + 2 + index * 12
            tag, typ, num = struct.unpack(endian + 'HHI', tiff[entry:entry + 8])
            if tag == wanted:
                size = sizes.get(typ, 1) * num
                if size <= 4:
                    return tiff[entry + 8:entry + 8 + size], typ
                value_offset = struct.unpack(endian + 'I', tiff[entry + 8:entry + 12])[0]
                return tiff[value_offset:value_offset + size], typ
        return None, None
    ifd0 = struct.unpack(endian + 'I', tiff[4:8])[0]
    raw, _ = read_ifd(ifd0, 0x9286)
    if raw is None:
        pointer, _ = read_ifd(ifd0, 0x8769)
        if pointer is None:
            return None
        raw, _ = read_ifd(struct.unpack(endian + 'I', pointer)[0], 0x9286)
    if raw is None:
        return None
    if raw.startswith(b'UNICODE\x00'):
        text = raw[8:].decode('utf-16-be', errors='replace')
    elif raw.startswith(b'ASCII\x00\x00\x00'):
        text = raw[8:].decode('ascii', errors='replace')
    else:
        text = raw.decode('utf-8', errors='replace')
    try:
        record = json.loads(text.strip('\x00'))
    except ValueError:
        return None
    if not isinstance(record, dict):
        return None
    record.pop('hmac', None)
    return record


def count_pdf_pages(pdf: bytes) -> int:
    return len(re.findall(rb'/Type\s*/Page(?![s\w])', pdf))


def verify_files(manifest: dict, nodes: list[dict], files: dict[str, bytes]) -> list[dict]:
    checks = []
    by_uuid = {node['uuid']: node for node in nodes}
    sn = manifest['instruction'].get('sn') or ''
    for entry in manifest['files']:
        check_id = f"file.sha512.{entry['path']}"
        if entry.get('missing'):
            checks.append(check(2, check_id, '文件摘要', 'fail', '导出时对象存储中已缺失'))
            continue
        data = files.get(entry['path'])
        if data is None:
            checks.append(check(2, check_id, '文件摘要', 'fail', '证据包内没有该文件'))
            continue
        actual = hashlib.sha512(data).hexdigest()
        payload = payload_of(by_uuid[entry['node_uuid']]) if entry['node_uuid'] in by_uuid else None
        on_chain = None
        image = None
        if payload:
            if entry['kind'] == 'image':
                image = next((item for item in payload.get('images', []) if item.get('uuid') == entry['uuid']), None)
                on_chain = image.get('sha512') if image else None
            elif entry['kind'] == 'signature':
                on_chain = (payload.get('signature') or {}).get('sha512')
            else:
                on_chain = (payload.get('receipt') or {}).get('sha512')
        if actual == entry['sha512'] and actual == on_chain:
            checks.append(check(2, check_id, '文件摘要', 'pass', '文件实算 / 清单 / 链上三方一致'))
        elif actual == entry['sha512'] and on_chain is None:
            checks.append(check(2, check_id, '文件摘要', 'warn', '与清单一致，节点原文未记录该文件摘要'))
        else:
            checks.append(check(2, check_id, '文件摘要', 'fail', f'实算 {actual[:16]}… 清单 {entry["sha512"][:16]}… 链上 {str(on_chain)[:16]}…'))
        if entry['kind'] == 'image':
            record = read_user_comment(data)
            if record is None:
                status = 'skip' if not (image or {}).get('raw_sha512') else 'fail'
                checks.append(check(2, f"file.exif.{entry['uuid']}", '图片 EXIF 记录', status, '旧图无 EXIF 记录' if status == 'skip' else '链上有 raw_sha512 但文件内读不到 EXIF 记录'))
                checks.append(check(2, f"file.watermark_text.{entry['uuid']}", '水印文字', 'skip', '无 EXIF 记录'))
                continue
            problems = []
            if str(record.get('uuid')) != entry['uuid']:
                problems.append('图片编号不符')
            if str(record.get('sn')) != sn:
                problems.append('申请单号不符')
            if (image or {}).get('raw_sha512') and record.get('raw_sha512') != image.get('raw_sha512'):
                problems.append('raw_sha512 不符')
            checks.append(check(2, f"file.exif.{entry['uuid']}", '图片 EXIF 记录', 'fail' if problems else 'pass', '；'.join(problems) or f'uuid / sn / raw_sha512 与链上一致，上传时间 {record.get("uploaded_at")}'))
            expected_text = (image or {}).get('watermark_text')
            if not expected_text:
                checks.append(check(2, f"file.watermark_text.{entry['uuid']}", '水印文字', 'skip', '链上无水印文字记录'))
            else:
                lines = [f'申请单号 {record.get("sn")}', f'上传时间 {record.get("uploaded_at")}', f'图片编号 {record.get("uuid")}']
                # 记录带 latitude / longitude（6 位小数字符串）时第四行原样拼接，与服务端 build_watermark_lines 一致
                if record.get('latitude') and record.get('longitude'):
                    lines.append(f'经纬度 {record.get("latitude")}, {record.get("longitude")}')
                rebuilt = '\n'.join(lines)
                checks.append(check(2, f"file.watermark_text.{entry['uuid']}", '水印文字', 'pass' if rebuilt == expected_text else 'fail', '由 EXIF 记录重建的水印文字与链上一致' if rebuilt == expected_text else '重建的水印文字与链上不一致'))
        elif entry['kind'] == 'receipt':
            declared = entry.get('page_count')
            if declared is None:
                checks.append(check(2, f"file.receipt.page_count.{entry['uuid']}", '电子回执页数', 'skip', '无页数记录'))
            else:
                pages = count_pdf_pages(data)
                qr = '、'.join(f'{sn}|{index}|{declared}' for index in range(1, declared + 1))
                checks.append(check(2, f"file.receipt.page_count.{entry['uuid']}", '电子回执页数', 'pass' if pages == declared else 'fail', f'PDF {pages} 页 / 记录 {declared} 页；每页二维码应为 {qr}'))
    return checks


# --- step3 ---
def verify_consistency(manifest: dict, nodes: list[dict]) -> list[dict]:
    checks = []
    for node in nodes:
        payload = payload_of(node)
        event_type = (payload or {}).get('event_type', node.get('event_type'))
        signed_type = ((payload or {}).get('order') or {}).get('signed_type', node['order'].get('signed_type'))
        phase = (payload or {}).get('image_phase', '__missing__')
        if payload is None or event_type is None or signed_type is None or phase == '__missing__':
            checks.append(check(3, f"consistency.event_phase.{node['uuid']}", '事件类型 / 单据类型 / 照片场景', 'skip', '旧节点缺键'))
        elif event_type == 'admin_backfill_sign':
            checks.append(check(3, f"consistency.event_phase.{node['uuid']}", '事件类型 / 单据类型 / 照片场景', 'warn', '历史后台补录节点'))
        else:
            ok = (event_type, signed_type, phase) in PHASE_RULES
            checks.append(check(3, f"consistency.event_phase.{node['uuid']}", '事件类型 / 单据类型 / 照片场景', 'pass' if ok else 'fail', f'{event_type} / {signed_type} / {phase}'))
        order = (payload or {}).get('order') or {}
        problems = []
        if 'id' in order and order['id'] != node['order']['id']:
            problems.append('order.id 不符')
        if 'instruction_id' in order and order['instruction_id'] != manifest['instruction']['id']:
            problems.append('instruction_id 不符')
        inst = (payload or {}).get('instruction') or {}
        if 'sn' in inst and inst['sn'] != manifest['instruction'].get('sn'):
            problems.append('申请单号不符')
        checks.append(check(3, f"consistency.order_ref.{node['uuid']}", '节点归属', 'fail' if problems else ('skip' if payload is None else 'pass'), '；'.join(problems)))
        images = (payload or {}).get('images')
        if images is None:
            checks.append(check(3, f"consistency.images_declared.{node['uuid']}", '图片清单对应', 'skip', '旧节点无 images'))
        else:
            declared = {item.get('uuid') for item in images}
            packaged = {re.sub(r'^files/images/|\.jpe?g$', '', path) for path in node.get('files', []) if path.startswith('files/images/')}
            checks.append(check(3, f"consistency.images_declared.{node['uuid']}", '图片清单对应', 'pass' if declared == packaged else 'fail', f'链上 {len(declared)} 张 / 包内 {len(packaged)} 张'))
    effective = sorted((node for node in nodes if not node['order'].get('voided')), key=lambda item: (parse_time(item['order'].get('time_signed')) or datetime.min, item['id']))
    types = ''.join(str(node['order'].get('signed_type') or 0) for node in effective)
    times = [parse_time(node['order'].get('time_signed')) for node in effective]
    increasing = all(times[i - 1] is None or times[i] is None or times[i - 1] < times[i] for i in range(1, len(times)))
    chain_after = all(parse_time(node['created_at']) >= (parse_time(node['order'].get('time_signed')) or datetime.min) for node in effective)
    if not effective:
        checks.append(check(3, 'consistency.sign_time_monotonic', '签收事件序列', 'skip', '没有有效签收单'))
    elif not re.fullmatch(r'1?3*2?', types) or not increasing:
        checks.append(check(3, 'consistency.sign_time_monotonic', '签收事件序列', 'fail', f'序列 {types} 或签单时间顺序不合法'))
    else:
        checks.append(check(3, 'consistency.sign_time_monotonic', '签收事件序列', 'pass' if chain_after else 'warn', f'序列 {types}'))
    offenders = []
    for node in nodes:
        payload = payload_of(node) or {}
        is_delivery = payload.get('event_type') == 'driver_sign' and (payload.get('order') or {}).get('signed_type', node['order'].get('signed_type')) == 2
        if bool(payload.get('receipt')) != is_delivery and ('receipt' in payload or payload.get('receipt')):
            offenders.append(node['uuid'])
    checks.append(check(3, 'consistency.receipt_only_delivery', '回执只随送货签收上链', 'fail' if offenders else 'pass', '、'.join(offenders)))
    for node in effective:
        payload = payload_of(node)
        if payload is None or 'signature' not in payload:
            checks.append(check(3, f"consistency.signature_rule.{node['uuid']}", '手写签名规则', 'skip', '旧节点'))
            continue
        way = (payload.get('order') or {}).get('signing_way', node['order'].get('signing_way'))
        signed_type = (payload.get('order') or {}).get('signed_type', node['order'].get('signed_type'))
        has = bool(payload.get('signature'))
        expected = way == 2 and signed_type in (1, 2)
        checks.append(check(3, f"consistency.signature_rule.{node['uuid']}", '手写签名规则', 'pass' if has == expected else 'warn', '符合规则' if has == expected else '签名有无与签单方式不符'))
    delivery = next((node for node in reversed(effective) if node['order'].get('signed_type') == 2), None)
    points = (payload_of(delivery) or {}).get('gps_locations') if delivery else None
    pickup = next((node for node in effective if node['order'].get('signed_type') == 1), None)
    relays = [node for node in effective if node['order'].get('signed_type') == 3]
    starts = ([pickup] + relays) if pickup else ([delivery] if delivery else [])
    by_order_id = {node['order']['id']: node for node in effective}
    for index, leg in enumerate(manifest.get('legs', [])):
        start, end = parse_time(leg.get('start_time')), parse_time(leg.get('end_time'))
        gps_id = f"consistency.gps_window.{leg['index']}"
        if points is None or start is None or end is None:
            checks.append(check(3, gps_id, f'第 {leg["index"]} 段轨迹时间窗', 'skip', '无送货节点轨迹或段窗口'))
        else:
            leg_points = [p for p in points if leg.get('driver_user_id') is None or p.get('driver_id') == leg.get('driver_user_id')]
            outside = [p for p in leg_points if (t := parse_time(p.get('gps_time'))) and (t < start - WINDOW_TOLERANCE or t > end + WINDOW_TOLERANCE)]
            status = 'warn' if not leg_points else ('fail' if outside else 'pass')
            checks.append(check(3, gps_id, f'第 {leg["index"]} 段轨迹时间窗', status, f'{len(leg_points)} 点，{len(outside)} 点越界'))
        start_node = by_order_id.get(leg['start_order_id']) if leg.get('start_order_id') is not None else (starts[index] if index < len(starts) else None)
        imei_id = f"consistency.leg_imei.{leg['index']}"
        if start_node is None:
            checks.append(check(3, imei_id, f'第 {leg["index"]} 段令牌', 'skip', '起点签收单不在证据包节点中（补录单或未关联节点）'))
        elif not leg.get('imei') and not start_node['order'].get('gps_imei'):
            checks.append(check(3, imei_id, f'第 {leg["index"]} 段令牌', 'skip', '未记录令牌'))
        else:
            ok = leg.get('imei') == start_node['order'].get('gps_imei')
            checks.append(check(3, imei_id, f'第 {leg["index"]} 段令牌', 'pass' if ok else 'fail', f'段 {leg.get("imei")} / 起点单 {start_node["order"].get("gps_imei")}'))
    voided = [node for node in nodes if node['order'].get('voided')]
    if voided:
        checks.append(check(3, 'consistency.voided_excluded', '作废节点', 'skip', '、'.join(node['uuid'] for node in voided)))
    return checks


# --- step4 ---
def parse_feishu_message(text: str) -> dict | None:
    """飞书群消息 {uuid, created_at, signature, signature_prev}；signature_prev 为 null 按空字符串。"""
    text = re.sub(r'^```[a-z]*\s*|\s*```$', '', text.strip(), flags=re.I).strip()
    try:
        record = json.loads(text)
    except ValueError:
        return None
    if not isinstance(record, dict) or not all(isinstance(record.get(key), str) for key in ('uuid', 'signature')):
        return None
    created_at = record.get('created_at') or record.get('dt')
    if not isinstance(created_at, str):
        return None
    return {'uuid': record['uuid'], 'created_at': created_at, 'signature': record['signature'], 'signature_prev': record.get('signature_prev') or ''}


class FeishuError(Exception):
    pass


def feishu_request(url: str, token: str | None = None, payload: dict | None = None) -> dict:
    """直连飞书开放平台（标准库 urllib）；code != 0 抛 FeishuError 带回飞书的 code / msg。"""
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = urllib.request.Request(url, data=data, headers=headers, method='POST' if payload is not None else 'GET')
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode('utf-8'))
        except ValueError:
            raise FeishuError(f'HTTP {exc.code}') from exc
    except (urllib.error.URLError, OSError) as exc:
        raise FeishuError(f'无法连接飞书: {exc}') from exc
    if body.get('code') not in (0, None):
        raise FeishuError(f'{body.get("code")}: {body.get("msg")}')
    return body


def feishu_tenant_token(app_id: str, app_secret: str, base: str = FEISHU_API_BASE) -> str:
    body = feishu_request(f'{base}/auth/v3/tenant_access_token/internal', payload={'app_id': app_id, 'app_secret': app_secret})
    return body['tenant_access_token']


def feishu_fetch_message(message_id: str, token: str, base: str = FEISHU_API_BASE) -> tuple[str, datetime]:
    """返回 (text 正文, 发送时间 UTC)；非 text 类型或已撤回抛 FeishuError。"""
    body = feishu_request(f'{base}/im/v1/messages/{message_id}', token=token)
    items = (body.get('data') or {}).get('items') or []
    if not items:
        raise FeishuError('飞书没有返回该消息')
    item = items[0]
    if item.get('deleted'):
        raise FeishuError('消息已被撤回或删除')
    if item.get('msg_type') != 'text':
        raise FeishuError(f'消息不是 text 类型: {item.get("msg_type")}')
    content = json.loads((item.get('body') or {}).get('content') or '{}')
    sent_at = datetime.fromtimestamp(int(item.get('create_time') or 0) / 1000, tz=timezone.utc)
    return str(content.get('text', '')), sent_at


def fetch_feishu_anchors(nodes: list[dict], app_id: str, app_secret: str, base: str = FEISHU_API_BASE) -> tuple[dict[str, str], dict[str, str], dict[str, datetime], dict[str, str]]:
    """按节点文件里的消息 id 拉取本节点消息与（后继不在包内的）后继消息；返回 (messages, successor_messages, sent_times, errors)。"""
    token = feishu_tenant_token(app_id, app_secret, base)
    in_package = {node['uuid'] for node in nodes}
    messages, successor_messages, sent_times, errors = {}, {}, {}, {}
    for node in nodes:
        if node.get('feishu_msg_id'):
            try:
                messages[node['uuid']], sent_times[node['uuid']] = feishu_fetch_message(node['feishu_msg_id'], token, base)
            except FeishuError as exc:
                errors[node['uuid']] = str(exc)
        nxt = node.get('next_node') or {}
        if nxt and nxt['uuid'] not in in_package and nxt.get('feishu_msg_id'):
            try:
                successor_messages[node['uuid']], sent_times[f'next:{node["uuid"]}'] = feishu_fetch_message(nxt['feishu_msg_id'], token, base)
            except FeishuError as exc:
                errors[f'next:{node["uuid"]}'] = str(exc)
    return messages, successor_messages, sent_times, errors


def anchor_time_check(node: dict, sent_at: datetime, successor: bool = False) -> dict:
    chain_text = (node.get('next_node') or {}).get('created_at') if successor else node['created_at']
    chain_time = parse_time(chain_text)
    check_id = f"anchor.next.time.{node['uuid']}" if successor else f"anchor.time.{node['uuid']}"
    title = '后继节点消息发送时间' if successor else '飞书消息发送时间'
    if chain_time is None:
        return check(4, check_id, title, 'skip', '上链时间无法解析')
    gap = sent_at - chain_time.replace(tzinfo=CHAIN_TZ)
    seconds = abs(gap.total_seconds())
    detail = f'飞书发送 {sent_at.astimezone(CHAIN_TZ):%Y-%m-%d %H:%M:%S}（北京时间）vs 上链 {chain_text}，相差 {seconds:.0f} 秒'
    return check(4, check_id, title, 'pass' if seconds <= ANCHOR_TIME_TOLERANCE.total_seconds() else 'warn', detail)


def verify_anchors(nodes: list[dict], messages: dict[str, str], successor_messages: dict[str, str] | None = None, sent_times: dict[str, datetime] | None = None, fetch_errors: dict[str, str] | None = None) -> list[dict]:
    """每个节点比对自己的飞书消息；后继不在包内的节点再比对「后继节点」的消息：其 signature_prev 应等于本节点哈希。
    sent_times（经飞书接口拉取时才有）→ 追加发送时间检查；fetch_errors → 拉取失败的条目直接判失败。"""
    successor_messages = successor_messages or {}
    sent_times = sent_times or {}
    fetch_errors = fetch_errors or {}
    in_package = {node['uuid'] for node in nodes}
    checks = []
    for node in nodes:
        text = messages.get(node['uuid'])
        if text is None:
            if node['uuid'] in fetch_errors:
                checks.append(check(4, f"anchor.{node['uuid']}", '飞书消息对照', 'fail', f'从飞书拉取失败: {fetch_errors[node["uuid"]]}'))
            else:
                checks.append(check(4, f"anchor.{node['uuid']}", '飞书消息对照', 'skip', '未提供飞书消息'))
            continue
        anchor = parse_feishu_message(text)
        if anchor is None:
            checks.append(check(4, f"anchor.{node['uuid']}", '飞书消息对照', 'fail', '消息不是节点摘要 JSON'))
            continue
        mismatches = [
            name for name, expected in (
                ('uuid', node['uuid']), ('created_at', node['created_at']), ('signature', node['signature']), ('signature_prev', node.get('prev_signature') or ''),
            ) if anchor[name] != expected
        ]
        checks.append(check(4, f"anchor.{node['uuid']}", '飞书消息对照', 'fail' if mismatches else 'pass', '不一致字段: ' + '、'.join(mismatches) if mismatches else '四项一致'))
        if node['uuid'] in sent_times:
            checks.append(anchor_time_check(node, sent_times[node['uuid']]))
    for node in nodes:
        nxt = node.get('next_node')
        if not nxt or nxt['uuid'] in in_package:
            continue
        text = successor_messages.get(node['uuid'])
        key = f'next:{node["uuid"]}'
        if text is None:
            if key in fetch_errors:
                checks.append(check(4, f"anchor.next.{node['uuid']}", '后继节点飞书消息对照', 'fail', f'从飞书拉取失败: {fetch_errors[key]}'))
            else:
                checks.append(check(4, f"anchor.next.{node['uuid']}", '后继节点飞书消息对照', 'skip', f'未提供后继 {nxt["uuid"]} 的飞书消息'))
            continue
        anchor = parse_feishu_message(text)
        if anchor is None:
            checks.append(check(4, f"anchor.next.{node['uuid']}", '后继节点飞书消息对照', 'fail', '消息不是节点摘要 JSON'))
            continue
        mismatches = [name for name, expected in (('uuid', nxt['uuid']), ('created_at', nxt['created_at']), ('signature', nxt['signature']), ('signature_prev', node['signature'])) if anchor[name] != expected]
        checks.append(check(4, f"anchor.next.{node['uuid']}", '后继节点飞书消息对照', 'fail' if mismatches else 'pass', '不一致字段: ' + '、'.join(mismatches) if mismatches else '后继消息把本节点哈希记为前驱'))
        if key in sent_times:
            checks.append(anchor_time_check(node, sent_times[key], successor=True))
    return checks


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='证据包离线核验')
    parser.add_argument('package', help='证据包 zip 路径')
    parser.add_argument('--feishu-json', action='append', default=[], metavar='UUID=FILE', help='某节点的飞书消息 JSON 文件')
    parser.add_argument('--feishu-next-json', action='append', default=[], metavar='UUID=FILE', help='某节点「后继节点」的飞书消息 JSON 文件（后继不在包内时用于佐证链接关系）')
    parser.add_argument('--feishu-app-id', default=os.environ.get('FEISHU_APP_ID'), help='飞书自建应用 App ID（或环境变量 FEISHU_APP_ID）；给了即直连飞书拉取消息')
    parser.add_argument('--feishu-app-secret', default=os.environ.get('FEISHU_APP_SECRET'), help='飞书自建应用 App Secret（或环境变量 FEISHU_APP_SECRET）')
    parser.add_argument('--feishu-api-base', default=FEISHU_API_BASE, help=f'飞书接口前缀，默认 {FEISHU_API_BASE}')
    parser.add_argument('--json', dest='report_path', help='把报告写成 JSON 文件')
    args = parser.parse_args(argv)
    messages = {}
    successor_messages = {}
    for option, target in (('--feishu-json', messages), ('--feishu-next-json', successor_messages)):
        for item in (args.feishu_json if option == '--feishu-json' else args.feishu_next_json):
            if '=' not in item:
                parser.error(f'{option} 需要 UUID=FILE 形式: {item}')
            node_uuid, path = item.split('=', 1)
            with open(path, encoding='utf-8') as handle:
                target[node_uuid] = handle.read()
    try:
        manifest, nodes, files = load_package(args.package)
    except SystemExit as exc:
        print(f'[错误] {exc}', file=sys.stderr)
        return 2
    sent_times: dict[str, datetime] = {}
    fetch_errors: dict[str, str] = {}
    if args.feishu_app_id and args.feishu_app_secret:
        try:
            fetched, fetched_successor, sent_times, fetch_errors = fetch_feishu_anchors(nodes, args.feishu_app_id, args.feishu_app_secret, args.feishu_api_base.rstrip('/'))
        except FeishuError as exc:
            print(f'[错误] 飞书凭证连接失败: {exc}', file=sys.stderr)
            return 2
        # 显式给的消息文件优先于拉取结果
        messages = {**fetched, **messages}
        successor_messages = {**fetched_successor, **successor_messages}
    elif args.feishu_app_id or args.feishu_app_secret:
        parser.error('--feishu-app-id 与 --feishu-app-secret 需要同时提供')
    checks = verify_nodes(nodes) + verify_files(manifest, nodes, files) + verify_consistency(manifest, nodes) + verify_anchors(nodes, messages, successor_messages, sent_times, fetch_errors)
    print(f"运单 {manifest['instruction'].get('sn')}  节点 {len(nodes)}  文件 {len(manifest['files'])}  导出 {manifest['package'].get('exported_at')}")
    for item in checks:
        print(f"[{STATUS_TEXT[item['status']]}] 步骤{item['step']} {item['id']}  {item['title']} — {item['detail']}")
    summary = {status: sum(1 for item in checks if item['status'] == status) for status in STATUS_TEXT}
    overall = 'fail' if summary['fail'] else ('warn' if summary['warn'] else 'pass')
    print(f"汇总：通过 {summary['pass']} / 失败 {summary['fail']} / 提示 {summary['warn']} / 跳过 {summary['skip']}  结论：{STATUS_TEXT[overall]}")
    if args.report_path:
        report = {'format_version': 1, 'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'), 'verifier': {'name': 'verify-python', 'version': '1.0.0'}, 'package': {'sn': manifest['instruction'].get('sn'), 'node_count': len(nodes), 'file_count': len(manifest['files'])}, 'checks': checks, 'summary': summary, 'overall': overall}
        with open(args.report_path, 'w', encoding='utf-8') as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    return 1 if summary['fail'] else 0


if __name__ == '__main__':
    sys.exit(main())
