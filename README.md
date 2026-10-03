# PLAYROOM

包含金币扫雷、小火箭、三骰挑战、闪电跑道和星际赛马的网页游戏 Demo。使用纯 HTML、CSS、JavaScript；所有积分均为浏览器会话内的模拟积分，刷新后重置，没有账户、充值、提现或真实资产交易。

## 本地运行

编辑 `src/`，发布文件由构建生成到 `dist/`。项目没有 npm 包依赖，不需要先执行 `npm install`。需要 Node.js 22 或更高版本。

```sh
npm run build
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:8765/`，从大厅进入游戏。不要双击 HTML 用 `file://` 打开；积分管理和 iframe 通信依赖同源 HTTP 页面。单独打开游戏 HTML 不会创建大厅的积分会话。

修改源码后重新运行构建并刷新预览。仅做快速开发预览时可把服务器目录改为 `src`；最终验证使用 `dist`。

检查命令：

```sh
npm run check
npm test
npm run build
```

`check` 检查 JavaScript 语法、HTML/CSS 与控制器里直接引用的本地资源、文件名大小写，以及八个入口（五款游戏、大厅、配色对比和配色体验）。它不是完整的 HTML/CSS 解析器，也不代替浏览器交互检查。`test` 自动执行 `tests/` 中的全部 Node 测试。`build` 先检查源码并运行全部测试，再生成带自动资源版本号的静态文件，检查产物后替换 `dist/`。检查失败会保留上一次可用的预览；部署会失败。`dist/` 已从 Git 跟踪中移除，不要直接编辑。

构建无第三方依赖，`node scripts/build.cjs` 与 `npm run build` 等价。版本号由完整源码和转换逻辑计算；相同源码重复构建的内容一致。资源路径保持原文件名，用自动生成的 `?v=` 更新缓存；这不是文件名哈希方案。

## Vercel 部署

在 Vercel 导入 GitHub 仓库 `pearsonchang/Games`，使用下列设置：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Other |
| Root Directory | 仓库根目录 `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | 留空，跳过安装 |
| Environment Variables | 当前 Demo 不需要 |

根目录的 `vercel.json` 已保存框架、检查命令、安装行为、输出目录和 URL 设置。Root Directory 是 `./`，不要选择 `dist`；本地工作区路径 `outputs/coinsweeper` 不是这个 GitHub 仓库内的子目录。

Vercel 构建时从 `src/` 生成 `dist/`，最终仅发布 `dist/`。源码说明、测试、`.openai/hosting.json` 和构建脚本不会作为网页资产发布。保留 `.openai/hosting.json` 供已有 Sites 网站使用；Vercel 使用自己的 `vercel.json`，两者可以共存。

`cleanUrls: true` 支持 `/palettes` 等无扩展名地址；现有 iframe 的 `.html` 地址会同源重定向到对应页面。`trailingSlash: false` 保持资源相对路径的目录层级。不要添加将全部请求重写到 `/index.html` 的 SPA 通配规则，否则独立游戏页面或资源路径可能被错误替换。

当前 Vercel 规则下，新项目的第一次部署属于 Production。之后推送非生产分支或创建 PR 会产生 Preview 部署，推送生产分支（通常是 `main`）会更新 Production。需要“只做预览”时，在已有项目上用功能分支或 PR。部署访问权限在 Vercel 项目中单独配置，原 Sites 的私有访问权限不会自动迁移。

部署后从根路径进入大厅，确认五款游戏都能进入、积分扣除/结算正常、返回大厅正常；另检查 `/palettes`、浏览器刷新和资源是否有 404。配置已可本地验证，实际 Vercel 地址和访问权限需在导入并完成部署后确认。

官方文档：[项目配置](https://vercel.com/docs/project-configuration/vercel-json)、[构建设置](https://vercel.com/docs/builds/configure-a-build)、[预览与生产环境](https://vercel.com/docs/deployments/environments)。

## 代码结构

- `src/platform-catalog.js`：游戏目录、名称和入口。
- `src/platform-wallet.js`：会话积分账本，整数小数位记账、金额校验、交易去重。
- `src/platform-bridge.js`：游戏实例、可信 iframe 消息、轮次检查与一次性结算。
- `src/platform-view.js`：大厅、奖励、记录和帮助的页面内容。
- `src/platform.js`：连接上述模块，处理导航和画面同步。
- `src/*-engine.js`：独立的概率与结算逻辑，可注入时钟和随机数。
- `src/rocket.js`、`dice.js` 等：游戏画面、交互和音效。
- `src/design-tokens.css`：当前 A 方案公共颜色；`theme-a.css` 和 `lobby-a.css` 消费这些变量。
- `src/*.webp`：压缩后的游戏素材，构建不依赖图片处理工具。
- `scripts/build.cjs`：检查、测试、生成静态产物；`build-static.cjs` 负责可重复的版本处理。
- `tests/`：概率、游戏状态、表现层、账本、消息协议和构建测试。
- `docs/rocket-probability.md`：小火箭 97% 理论返还率的推导与边界。

## 本次完成与下一阶段

已完成共享模块拆分、五款游戏统一轮次校验、积分交易去重、源码与产物分离、资源自动版本、公共配色变量和无损素材压缩。30 张 PNG 转为 lossless WebP，原尺寸和透明度不变，可见像素逐一验证一致，合计减少 11,117,958 字节（约 10.6 MiB）。旧素材可从改动前的 Git 历史恢复。

保留现有样式的加载顺序以减少视觉回归。下一阶段可以按游戏逐一合并叠加样式、归档未使用素材，并在模块进一步稳定后引入统一格式化工具。本次没有完整重写所有 CSS。

当前游戏仍是浏览器会话内的模拟积分，概率规则保持不变。真实账户、跨设备积分或可兑换奖励需要可信后端与持久化账本；前端轮次校验和去重用于防止程序误结算，不能阻止用户修改自己的客户端。

Sites 兼容配置保留；若继续发布到 Sites，必须先执行构建再打包 `dist/`。本次以 GitHub/Vercel 构建准备为目标，不会自动创建新的 Vercel 项目。
