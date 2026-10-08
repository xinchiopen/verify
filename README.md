# verify

签收存证链的**独立核验站**与**核验库**。面向客户法务 / 公证 / 仲裁等第三方：讲清存证链原理，分四步演示核验方法（原理说明 + TypeScript / Python 示例代码 + 可交互演示与篡改实验），并支持把后台导出的「证据包」拖进浏览器离线核验——解压、SHA-512、比对全部在本机完成，文件不离开浏览器。

本仓库公开（MIT），任何人都可以审阅算法、自行构建或直接引用核验库。线上站点 `https://xinchiopen.github.io/verify/` 由本仓库 `main` 分支经 GitHub Actions 自动发布，第四步飞书请求经 `worker/` 的 Cloudflare Worker 转发；自行部署时任何静态托管都可以，但必须 HTTPS（Web Crypto 只在安全上下文可用），站点标题与页头品牌字样由构建变量 `VITE_APP_TITLE` 注入。

## 技术栈

- Vue 3、TypeScript、Vite 7、vue-router；不用 UI 组件库，纯 CSS（宣纸白 / 无衬线正文 / 印章式结论）
- `fflate` 解压 zip；Web Crypto 计算 SHA-512；手写最小 EXIF / PNG / PDF 读写（无其他运行时依赖）
- 工程配置：pnpm 9.15.4、`@antfu/eslint-config`、Vitest 4 + happy-dom

## 目录

```
src/lib/        核验库（零 DOM 依赖，可单独构建）：package / node / files / exif / consistency / anchor / report / verify
src/lib/demo/   现场生成演示链（pyjson 复刻 Python 序列化，仅演示用）
src/app/        浏览器侧工具：canvas JPEG、下载、代码示例切片、高德加载
src/pages/      / 原理  /steps/1..4 分步演示  /verify 证据包核验
scripts/verify_evidence_package.py   仅标准库的 Python 参考脚本（站点上的 Python 示例从它切片）
tests/          Vitest；tests/fixtures/golden-evidence-package.zip 为后端真实代码路径导出的回归夹具
worker/         飞书转发代理的 Cloudflare Worker 实现（wrangler.jsonc + src/）
docs/           本项目文档与证据包格式契约（docs/evidence_package_format.md）
```

## 常用命令

```bash
pnpm install
pnpm dev              # http://localhost:3334
pnpm exec eslint .    # CI 不带 --fix
pnpm test -- --run    # Vitest，含 golden 证据包全量核验（必须 0 失败）
pnpm build            # 站点 → dist/
pnpm build:lib        # 核验库 ESM + d.ts → dist-lib/（暂不发 npm）
pnpm worker:dev       # 本地起飞书转发代理 Worker（wrangler dev）
pnpm worker:deploy    # 部署到自己的 Cloudflare 账号（需先 wrangler login）
pnpm verify:py        # python3 scripts/verify_evidence_package.py tests/fixtures/golden-evidence-package.zip
                      # 脚本还接受 --feishu-json UUID=FILE / --feishu-next-json UUID=FILE（后继节点的消息），
                      # 以及 --feishu-app-id/--feishu-app-secret（或环境变量）直连飞书拉取并核对发送时间；Python ≥ 3.8
```

构建期变量（`.env` 已入库且公开，本地覆盖请写在被 git 忽略的 `.env.local`）：`VITE_AMAP_WEB_KEY` / `VITE_AMAP_SECURITY_JS_CODE`（填了才出现「在高德地图上查看」按钮，高德 key 不要提交进仓库）、`VITE_FEISHU_API_BASE`（飞书转发代理地址，见下节；空 = 同源 `/feishu-api`，开发期由 `vite.config.ts` 的 `server.proxy` 转发，自建站由 nginx 反代；GitHub Pages 构建由 CI 注入 Worker 地址；核验页「高级」里也可临时改为自己的代理）、`VITE_PUBLIC_PATH`（默认 `/`，Pages 镜像构建时为 `/verify/`）。除用户主动开启地图或填飞书凭证外，站点零外部请求。

## 飞书转发代理（Feishu Relay Proxy）

`open.feishu.cn` 不返回 CORS 头，浏览器无法直连；第四步「以飞书凭证直接拉取」因此要经一个**无状态、不持有凭证、不记录内容**的转发层，即飞书转发代理。两种实现：

- 自行用 nginx 等部署时：同源反代 `/feishu-api/` 到 `https://open.feishu.cn/open-apis/`，只转发不记日志。
- GitHub Pages：`worker/` 的 Cloudflare Worker。边界写在 `worker/src/relay.ts`：Origin 白名单（`wrangler.jsonc` 的 `ALLOWED_ORIGINS`，逗号分隔）、只放行 `POST /auth/v3/tenant_access_token/internal` 与 `GET /im/v1/messages/{id}` 两条路径、请求头只透传 `Content-Type` / `Authorization`、请求体 16 KB 上限、响应剥 `Set-Cookie` 并 `no-store`、关闭 Workers Logs。`tests/worker/relay.test.ts` 覆盖全部边界。注意 Origin 白名单只能阻止其他网页借用（浏览器强制），脚本可以伪造 Origin，所以它不是访问控制：任何人都能借这个 Worker 调这两条飞书接口，代价是我们的 Workers 免费额度。Origin 不在白名单时预检就被拒，浏览器只能看到网络错误，页面会提示检查代理的 `ALLOWED_ORIGINS`。

不信任我们的代理？两种办法：改用 Python 参考脚本直连飞书；或自己部署一份 Worker（`pnpm worker:deploy`，把 `ALLOWED_ORIGINS` 改成你的站点源），然后在核验页第四步「高级：转发代理地址」填入你的 Worker 地址——该值与凭证一起只在当前会话保存。

## 核验库 API 速览

```ts
import { computeNodeSignature, parseEvidencePackage, verifyEvidencePackage } from "./src/lib"

const report = await verifyEvidencePackage(zipFileOrBytes, { feishuMessages: { [nodeUuid]: pastedJson }, successorFeishuMessages: { [nodeUuid]: pastedSuccessorJson } })
report.overall // "pass" | "warn" | "fail"
report.checks // [{ id, step: 1|2|3|4, status: "pass"|"fail"|"warn"|"skip", title, detail, expected?, actual? }]
```

四步与检查项 id：

| 步  | 内容                                                                                                                                                                                         | id 前缀                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | 节点哈希重算 `sha512(uuid + created_at + prev_signature + data)`、前驱 / 后继链接（后继不在包内 → 跳过）、上链时间顺序                                                                       | `node.hash.*` `node.link.adjacent.*` `node.link.next.*` `node.order.created_at`   |
| 2   | 文件 SHA-512 三方比对（文件 / 清单 / 链上）、图片 EXIF 记录与水印文字交叉、回执页数与二维码文本                                                                                              | `file.sha512.*` `file.exif.*` `file.watermark_text.*` `file.receipt.page_count.*` |
| 3   | 事件类型 / 单据类型 / 照片场景、节点归属、签收事件序列、回执归属、签名规则、轨迹时间窗、运输段令牌、图片清单对应、作废节点                                                                   | `consistency.*`                                                                   |
| 4   | 飞书群消息 `{uuid, created_at, signature, signature_prev}` 对照；后继不在包内的节点可再粘贴后继节点的消息，核对其 `signature_prev` 等于本节点哈希；用飞书凭证拉取时另比对发送时间（±5 分钟） | `anchor.*` `anchor.next.*` `anchor.time.*` `anchor.next.time.*`                   |

真实证据包的核验**只拼接节点原文**重算哈希，绝不重新序列化；`pyjson.ts` 只服务于演示链。EXIF 里的 `hmac` 字段由服务端私钥派生，库里不读、不算、不展示。

## Golden 夹具再生成

`tests/fixtures/golden-evidence-package.zip` 由出具方后端测试 `GoldenEvidencePackageTests` 经真实签收 → 接力 → 送货（作废）→ 再送货 代码路径生成（4 节点、1 作废、9 份原件，全部为演示数据）。它不是可复现产物，外部贡献者无法重生成；后端链载荷或证据包格式变化时由维护者重生成并连同 Vitest 一起提交到本仓库。

## 相关文档

- 证据包格式契约：`docs/evidence_package_format.md`（出具方后端仓库同名文档的公开副本）
- 本项目文档：`docs/README.md`
- 存证链设计决策与白皮书属出具方内部文档，未公开
