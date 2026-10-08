> 来源：SiRoute 后端仓库 `SiRouteServer/docs/external/evidence_package_format.md`。本文件是对外公开副本，证据包格式变更时两处必须同步修改。

# SiRoute 证据包格式说明（format_version 1）

> 面向需要**独立核验**签收存证的第三方（客户法务、公证、仲裁机构）与其技术人员。
> 公开副本：<https://github.com/xinchiopen/verify/blob/main/docs/evidence_package_format.md>（`SiRouteVerify/docs/evidence_package_format.md`，仅多一行来源说明）；修改本文须同步该副本。
> 证据包由 SiRoute 后台导出，核验在 `https://verify.siroute.com`（纯浏览器本地计算）或 `SiRouteVerify/scripts/verify_evidence_package.py`（Python 标准库脚本）中完成，二者算法一致。
> 存证链本身的数据结构见《签收存证链数据结构说明（京东对接版）》（`event_chain_data_spec.md`），本文只描述证据包的打包格式与核验公式。

---

## 1. 概述

- 一个证据包对应**一张运单**（申请单号 `sn`），是一个 zip 文件：`证据包_{sn}.zip`。
- 包内只有三类内容：**清单** `manifest.json`、该运单的**链节点原文** `nodes/*.json`、各节点引用的**证据原件** `files/**`（签单图片 / 手写签名 / 电子回执）。
- 导出入口：管理后台运单列表 / 详情页「证据包」按钮（`GET instructions/{id}/evidence-package/`，权限 `instruction.evidence.export`），或命令 `python manage.py export_evidence_package --sn <sn> [--instruction-id N] [--out DIR] [--allow-missing]`。两者同一实现；只读，不写库，不记操作记录。
- 证据包是**原件的集合**，不是结论：核验结果以核验方自行重算为准。它与「存证报告」（后台按需排版的 PDF 汇编，不是证据）是两回事。

## 2. zip 结构

```
证据包_{sn}.zip
├── manifest.json                       # 清单
├── nodes/{node_uuid}.json              # 每个链节点一个文件
└── files/
    ├── images/{file_uuid}.jpg          # 带水印的签单 JPEG（存证即此文件）
    ├── signatures/{signature_uuid}.png # 收发货人手写签名
    └── receipts/{receipt_uuid}.pdf     # 送货签收时生成的已签电子回执
```

zip 内路径全部为 ASCII；只有外层文件名含中文。zip 使用 Deflate 压缩，不使用 ZIP64。

## 3. 核验公式（与存证链一致）

```text
raw       = uuid + created_at + prev_signature + data
signature = SHA-512(raw 的 UTF-8 字节) 的小写十六进制
```

- 四段直接拼接，没有分隔符；
- `created_at` 使用节点文件里的字符串**原样**拼接（`YYYY-MM-DD HH:MM:SS.ffffff`，恒 6 位微秒）；
- `prev_signature` 是前驱节点的 `signature`；全链第一个节点为空字符串；
- `data` 使用节点文件里的字符串**原样**拼接。它是服务端落库的 JSON 原文（`json.dumps(sort_keys=True, ensure_ascii=False)`），**不要**解析后重新序列化，任何格式化差异都会改变哈希。

Python 参考实现（标准库）：

```python
import hashlib

def verify_node(node: dict) -> bool:
    raw = f"{node['uuid']}{node['created_at']}{node['prev_signature']}{node['data']}"
    return hashlib.sha512(raw.encode('utf-8')).hexdigest() == node['signature']
```

证据文件核验：`SHA-512(文件字节)` 应同时等于 `manifest.files[].sha512`（SiRoute 库内记录）和节点 `data` 内对应的摘要（`images[].sha512` / `signature.sha512` / `receipt.sha512`，链上记录）。三者一致即文件自签收时刻起未被改动。

## 4. `manifest.json`

```jsonc
{
  "format_version": 1,
  "package": {
    "kind": "siroute-evidence-package",
    "exported_at": "2026-10-05 00:07:05",          // 导出时间（北京时间）
    "exporter": "SiRouteServer export_evidence_package",
    "exporter_version": "1.0.0",
    "environment": "PROD",                          // PROD / TEST
    "allow_missing": false                          // 导出时是否允许证据文件缺失
  },
  "instruction": {                                  // 运单摘要（白名单字段，不含联系人电话）
    "id": 1, "sn": "…", "shipping_sn": "…", "status": 5, "date_ship": "2026-04-14",
    "source_city": "…", "source_address": "…", "target_city": "…", "target_address": "…",
    "time_picked_up": "…", "time_delivered": "…", "transportation": 1, "device": "…", "amount": 2
  },
  "nodes": [                                        // 本运单的全部链节点，按链上顺序（节点 id 升序），含作废单的节点
    { "uuid": "…", "path": "nodes/….json", "id": 9001, "created_at": "2026-04-14 09:00:00.123456",
      "order_id": 55, "event_type": "driver_sign", "voided": false }
  ],
  "orders": [                                       // 本运单全部已完成的签收单（含补录单、作废单），按事件序列
    { "id": 55, "uuid": "…", "signed_type": 1, "signing_way": 2, "source": 1, "time_signed": "…",
      "gps_imei": "…", "jd_erp": null, "chained": true, "voided": false, "voided_at": null, "void_reason": "",
      "driver_name": "…", "chain_node_uuid": "…", "note": null }       // note: null | "backfill" | "node_missing"
  ],
  "legs": [                                         // 运输段：仅按有效签收单切分（提货 → 接力… → 送货）
    { "index": 1, "driver_user_id": 7, "driver_name": "…", "imei": "…",
      "start_time": "…", "end_time": "…", "total_points": 312,
      "start_order_id": 55, "end_order_id": 56 }                 // 段起点 / 终点签收单 id（起点单可能是补录单，不在 nodes 里）
  ],
  "files": [                                        // 证据原件清单；sha512 / size 等是 SiRoute 库内记录
    { "kind": "image", "uuid": "…", "path": "files/images/….jpg", "sha512": "…", "size": 1834211,
      "content_type": "image/jpeg", "storage_key": "carrier/images/….jpg", "node_uuid": "…", "order_id": 55,
      "raw_sha512": "…", "watermark_text": "申请单号 …\n上传时间 …\n图片编号 …\n经纬度 31.200000, 121.400000",
      "latitude": 31.2, "longitude": 121.4, "page_count": null, "missing": false },
    { "kind": "signature", "…": "…", "content_type": "image/png" },
    { "kind": "receipt",   "…": "…", "content_type": "application/pdf", "page_count": 2 }
  ],
  "notes": []                                       // 导出期的人读提示（缺失文件、未关联节点的签收单等）
}
```

字段约定：

| 字段 | 说明 |
|---|---|
| `orders[].note` | `backfill`：管理员补录单，不上链、凭证图不导出；`node_missing`：历史司机签收单标记已上链但库内未关联到节点，未导出 |
| `orders[].signed_type` | `1` 提货单、`2` 签收单（送货）、`3` 接力单 |
| `orders[].signing_way` | `1` 京东通行码、`2` 微信小程序码 |
| `legs[]` | 一段 = 同一司机、同一令牌完成的运输；作废单不参与切段。没有有效送货单时为空。`start_order_id` / `end_order_id` 指向 `orders[]`；起点单若是补录单或未关联节点，核验工具对该段的令牌检查记「跳过」 |
| `files[].sha512` | 库内记录；`image` 为带水印 JPEG 的摘要，`raw_sha512` 是司机原始上传字节的摘要（原图不保留） |
| `files[].size` | 文件实际字节数；`missing=true` 时为库内记录值 |
| `files[].latitude` / `longitude` | 水印第四行的签单令牌经纬度（WGS-84，数值）；图片没有位置行时为 `null`，2026-10-08 前导出的证据包没有这两个键 |
| `files[].storage_key` | 实际读取命中的对象存储路径（2026 年水印上线前的旧图可能是 `.jpeg`） |
| `files[].missing` | `true` 表示导出时对象存储中已找不到该文件（仅 `--allow-missing` 时出现），包内没有该文件 |

## 5. `nodes/{uuid}.json`

```jsonc
{
  "format_version": 1,
  "uuid": "…",
  "id": 9001,                                       // 库内节点 id（链上顺序）
  "previous_node_id": 9000,                         // 前驱节点 id；全链首节点为 null
  "created_at": "2026-04-14 09:00:00.123456",       // 哈希输入原样字符串
  "prev_signature": "…",                            // 前驱节点哈希；全链首节点为 ""
  "signature": "…",                                 // 本节点哈希（SHA-512，128 位十六进制）
  "feishu_msg_id": "om_…",                          // 写链时同步发到飞书群的消息 id（链外锚点线索）
  "data": "{…}",                                    // 库内 JSON 原文字符串，逐字节未动
  "event_type": "driver_sign",                      // 从 data 解析出的便利字段，核验不依赖它
  "order": { "id": 55, "uuid": "…", "signed_type": 1, "signing_way": 2, "source": 1, "time_signed": "…",
             "gps_imei": "…", "jd_erp": null, "chained": true, "voided": false, "voided_at": null, "void_reason": "" },
  "next_node": { "uuid": "…", "created_at": "…", "signature": "…", "feishu_msg_id": "om_…" },   // 后继节点线索；链尾为 null
  "files": ["files/images/….jpg", "files/signatures/….png"]           // 本节点引用的证据原件
}
```

`data` 的内部结构（`instruction` / `order` / `images[]` / `signature` / `receipt` / `leg` / `gps_locations[]` …）见 `event_chain_data_spec.md` §4–§6。

## 6. 邻居节点的披露边界

SiRoute 的存证链是**全系统一条**，一张运单的节点之间通常夹着其他客户运单的节点。为了不泄露其他运单的数据：

- **前驱节点只给 `prev_signature`**。重算本节点哈希只需要它，不需要前驱的 `data`。
- **后继节点只给 `{uuid, created_at, signature, feishu_msg_id}`**。要证明「后继确实引用了本节点」必须有后继的 `data` 原文，证据包不含它，因此这项**在包内不可重算**，核验工具记「跳过」。后继关系的佐证来自链外锚点：凭 `feishu_msg_id` 向 SiRoute 索取**后继节点**的飞书群消息，其 `signature_prev` 应等于本节点的 `signature`——核验工具第四步支持粘贴该消息比对（`anchor.next.<uuid>`）。京东侧保存的节点副本与 SiRoute 数据库现场核对亦可。
- 其他运单的 `data` 永不导出。

## 7. 作废单、补录单与旧节点

- **作废单**（管理员标记为业务无效的签收单）的节点**照样导出**：链上节点不会因作废而消失，`nodes[].voided=true`、节点文件 `order.voided* ` 齐全。核验工具对它仍做哈希 / 文件校验，但不把它算进业务一致性与运输段。
- **补录单**（管理员事后登记的签收记录）不上链，只出现在 `orders[]` 清单中（`note="backfill"`），其凭证图不导出。历史上曾上链的补录节点（`event_type=admin_backfill_sign`）若与签收单关联则照常导出。
- **旧节点**可能缺少后来新增的字段（如 `images[].raw_sha512` / `watermark_text` / `latitude` / `longitude`、`receipt`、`instruction_assignments`），核验工具对缺失字段按「跳过」处理，不判失败。

## 8. 图片水印与 EXIF 记录

签单图片落盘前印有可见水印（左下角三行：申请单号 / 上传时间 / 图片编号；司机绑定的 GPS 令牌在线时第四行 `经纬度 {lat}, {lng}`，WGS-84），并在 EXIF `UserComment` 中写入 `{uuid, sn, uploaded_at, raw_sha512, hmac}`（`UNICODE\0` 前缀 + UTF-16BE 编码的 JSON；带坐标时另含 `latitude` / `longitude`，为 6 位小数**字符串**，与可见行相同）。

- `uuid` / `sn` / `raw_sha512` 可与节点 `data.images[]` 及 `manifest.instruction.sn` 交叉比对；
- 由记录重建水印文字时，三行固定；记录带 `latitude` / `longitude` 则原样拼第四行 `经纬度 {latitude}, {longitude}`，再与节点 `images[].watermark_text` 全等比对（不要用链上的数值重新格式化）；
- `hmac` 由服务端私有密钥派生，第三方**无法复算**，证据包与核验工具都不处理它；需要时由 SiRoute 用 `verify_image_watermark` 命令复核。

## 9. 核验步骤（核验工具的实现顺序）

1. **节点哈希与链接**：逐节点重算 `signature`；包内相邻节点满足 `node[n].prev_signature == node[n-1].signature`；后继不在包内时记「跳过」。
2. **证据文件**：逐文件 SHA-512 与 `manifest.files[].sha512`、节点 `data` 内摘要三方一致；图片 EXIF 记录与节点交叉比对；回执页数与 `page_count` 一致（每页二维码内容为 `sn|页码|总页数`）。
3. **业务一致性**：`event_type` / `order.signed_type` / `image_phase` 对应（提货 `driver_sign`/1/4、送货 `driver_sign`/2/5、接力 `driver_relay`/3/6）；有效签收单时间单调（提货 → 接力… → 送货）；回执只出现在送货节点；GPS 点落在所属运输段时间窗内；节点 `images[]` 与包内文件一一对应。
4. **链外锚点**：把飞书群消息 `{uuid, created_at, signature, signature_prev}` 与节点比对；对后继不在包内的节点，可再粘贴**后继节点**的飞书消息，核对其 `signature_prev` 等于本节点哈希。核验方也可用自己的飞书自建应用凭证（机器人在存证群内、有消息读取权限）按 `feishu_msg_id` 直接拉取，并核对飞书记录的发送时间与 `created_at` 相差不超过 5 分钟。

## 10. 版本

| 版本 | 日期 | 说明 |
|---|---|---|
| 1 | 2026-10-05 | 首版 |
| 1 | 2026-10-05 | `legs[]` 增加 `start_order_id` / `end_order_id`；`next_node` 增加 `feishu_msg_id`（均为追加字段，版本不变） |

格式只增不改：新增字段不改版本号；语义变化才升级 `format_version`，核验工具按版本分支处理。
