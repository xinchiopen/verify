# verify 文档

## 路由

| 路径       | 页面                               | 说明                                                                                                                                 |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/`        | `pages/home/index.vue`             | 原理长文：哈希输入四段拼接的实时演示、存证链是什么 / 不是什么、证据包结构、四步入口、隐私声明、下载演示证据包                        |
| `/steps/1` | `pages/steps/Step1Hash.vue`        | 节点哈希重算与链接；可编辑 `created_at` / `data` 看哈希变化                                                                          |
| `/steps/2` | `pages/steps/Step2Files.vue`       | 证据原件摘要三方比对、EXIF 记录、回执预览；可用本地图片替换签单照                                                                    |
| `/steps/3` | `pages/steps/Step3Consistency.vue` | 业务一致性规则表、运输段时间轴与离线轨迹草图；四个篡改按钮                                                                           |
| `/steps/4` | `pages/steps/Step4Anchor.vue`      | 飞书消息粘贴比对                                                                                                                     |
| `/verify`  | `pages/verify/index.vue`           | 上传证据包 → 盖章式结论 → 四步分区报告（第四步可粘贴每个节点的飞书消息，以及后继不在包内的节点的「后继节点消息」）→ 下载 JSON / 打印 |

## 组件

- `components/layout/`：`AppHeader`、`AppFooter`、`PaperCard`（卡片）、`StepLayout`（步骤导航 + 左说明右交互双栏 + 翻页）
- `components/report/`：`FeishuConnect`（飞书凭证输入 / 连接 / 全部拉取）、`SealMark`（印章式结论，`status` pass/fail/warn/skip）、`CheckList` / `CheckItem`（检查项列表，可只看未通过）、`HashBlock`、`NodeCard`（四段输入 + 记录 / 重算哈希 + 链接）、`ImageEvidenceCard`（图 + EXIF 表 + 应印水印）、`PdfPreview`（`<object>` 预览 + 应有二维码文本）、`VoidedSection`、`ReportSummary`
- `components/track/`：`legs.ts`（按运输段归并轨迹点）、`TrackSketch`（离线 SVG）、`LegTimeline`（时间窗 + 点分布）、`AmapTrack`（仅配置了 `VITE_AMAP_WEB_KEY` 时渲染，点击才加载 SDK）
- `components/common/`：`FileDrop`、`CodeTabs`（TS / Python 切换 + 复制）、`JsonEditor`、`Callout`
- `components/diagram/`：`ChainDiagram`（三节点链接 SVG）、`PackageDiagram`（zip 结构）

## 组合式函数

- `useDemoChain`：全站只生成一次演示链（固定种子 + 当天中午），各页用 `clonePackage` 复制后做篡改实验；页面持有包用 `shallowRef`（深层响应式 Proxy 会让 `structuredClone` 失败）
- `useVerification`：解析 → 节点 → 文件 → 一致性 → 锚点，分阶段进度；`rerunAnchors` 只重跑第四步（`feishuMessages` + `successorFeishuMessages` + `feishuMessageMeta`）；`fetchAnchor(kind, uuid)` / `fetchAllAnchors()` 经 `src/lib/feishu.ts` 拉取消息并填表
- `useFeishuConnection`：全站共享的飞书凭证、转发代理地址 `proxyBase` 与 tenant token（token 只在内存；勾选「本次会话记住」才把 `{appId, appSecret, proxyBase}` 写进同一个 sessionStorage 键，旧版只有前两项的值仍可读）；`DEFAULT_FEISHU_API_BASE` 来自 `VITE_FEISHU_API_BASE`，默认同源 `/feishu-api`；`normalizeProxyBase` / `describeProxyBase` / `isValidProxyBase` 为纯函数，`proxyBaseDisplay` 供各页面文案显示当前生效的代理地址

## 核验库（`src/lib`）

见根 README「核验库 API 速览」。模块：`types` / `hash` / `node` / `package` / `payload` / `files` / `exif` / `watermark` / `consistency` / `anchor` / `report` / `verify` / `geo` / `pyjson` / `demo/*` / `index`。`vite.lib.config.ts` 把 `src/lib/index.ts` 打成 ESM（`fflate` 外置），`tsconfig.lib.json` 出 d.ts。

## 测试

`tests/*.test.ts` 默认 node 环境（Web Crypto 由 Node 提供）；组件测试放 `tests/components/`，文件头加 `// @vitest-environment happy-dom`。`tests/helpers.ts` 直接解 golden zip 供底层模块测试；`tests/golden` 相关断言在 `package` / `files` / `consistency` / `verify` 测试里，要求 golden 包 0 失败。`SIROUTE_DEMO_ZIP_OUT=<path> pnpm test -- --run tests/demo.test.ts` 可把演示包写出来给 Python 脚本交叉核验。

## 部署

**GitHub Pages `https://xinchiopen.github.io/verify/`**：`.github/workflows/pages.yml` 在 push `main` 时构建（`VITE_PUBLIC_PATH=/verify/`，高德 key 与 `VITE_FEISHU_API_BASE` 来自仓库 Variables），把 `index.html` 复制为 `404.html` 做 SPA 回退并加 `.nojekyll`，用 `actions/deploy-pages` 发布。Pages 没有反代，飞书转发代理由 `worker/` 的 Cloudflare Worker 承担（`.github/workflows/worker.yml` 在 `worker/**` 变更时 `wrangler deploy`，Secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）。

## 飞书转发代理

`worker/src/relay.ts` 导出 `createRelayHandler({ allowedOrigins, upstreamFetch?, … })`，`worker/src/index.ts` 是 Workers 入口（按 `env.ALLOWED_ORIGINS` 构造一次处理器）。边界：Origin 白名单、只放行取 token 与按 id 读消息两条路径、只透传 `Content-Type` / `Authorization`、16 KB 请求体上限、响应剥 `Set-Cookie` + `no-store`、`observability` 关闭且不写 console。路径 / 方法 / 体积 / 上游错误（404 / 405 / 413 / 502 / 504）返回 `{ relay_error }`，`src/lib/feishu.ts` 据此提示「转发代理拒绝请求」而不是误报成飞书错误；Origin 不在白名单时预检即 403 且无 CORS 头，浏览器只抛网络错误，`callFeishu` 的网络错误文案因此附带「检查 ALLOWED_ORIGINS」提示。`proxyBase` 一变即清空令牌，令牌不会带到新地址。测试 `tests/worker/relay.test.ts` 在 node 环境注入 `upstreamFetch`，不依赖 Workers 运行时。
