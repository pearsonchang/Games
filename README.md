# PLAYROOM

包含金币扫雷、小火箭、三骰挑战、闪电跑道和星际赛马的网页游戏 Demo。使用纯 HTML、CSS、JavaScript；所有积分均为浏览器会话内的模拟积分，刷新后重置，没有账户、充值、提现或真实资产交易。

## 本地运行

目前 `dist/` 同时存放可编辑页面与可发布文件，它不是可删除后重建的临时目录。项目没有 npm 依赖，不需要先执行 `npm install`。

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:8765/`，从大厅进入游戏。不要双击 HTML 用 `file://` 打开；积分管理和 iframe 通信依赖同源 HTTP 页面。单独打开游戏 HTML 不会创建大厅的积分会话。

检查代码需要 Node.js 22 或更高版本：

```sh
npm run check
npm test
npm run build
```

`check` 检查 JavaScript 语法、HTML/CSS 与控制器里直接引用的本地资源、文件名大小写，以及六个入口。它不是完整的 HTML/CSS 解析器，也不代替浏览器交互检查。`test` 自动执行 `tests/` 中的全部 Node 测试。`build` 先检查再测试，不转换或删除 `dist/`，失败时阻止部署。

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

Vercel 最终仅发布 `dist/`。源码说明、测试、`.openai/hosting.json` 和脚本不会作为网页资产发布。保留 `.openai/hosting.json` 供已有 Sites 网站使用；Vercel 使用自己的 `vercel.json`，两者可以共存。

`cleanUrls: true` 支持 `/palettes` 等无扩展名地址；现有 iframe 的 `.html` 地址会同源重定向到对应页面。`trailingSlash: false` 保持资源相对路径的目录层级。不要添加将全部请求重写到 `/index.html` 的 SPA 通配规则，否则独立游戏页面或资源路径可能被错误替换。

当前 Vercel 规则下，新项目的第一次部署属于 Production。之后推送非生产分支或创建 PR 会产生 Preview 部署，推送生产分支（通常是 `main`）会更新 Production。需要“只做预览”时，在已有项目上用功能分支或 PR。部署访问权限在 Vercel 项目中单独配置，原 Sites 的私有访问权限不会自动迁移。

部署后从根路径进入大厅，确认五款游戏都能进入、积分扣除/结算正常、返回大厅正常；另检查 `/palettes`、浏览器刷新和资源是否有 404。配置已可本地验证，实际 Vercel 地址和访问权限需在导入并完成部署后确认。

官方文档：[项目配置](https://vercel.com/docs/project-configuration/vercel-json)、[构建设置](https://vercel.com/docs/builds/configure-a-build)、[预览与生产环境](https://vercel.com/docs/deployments/environments)。

## 代码结构

- `dist/index.html`、`platform.js`：大厅、游戏入口、共享积分、记录与 iframe 消息分发。
- `dist/*-engine.js`：独立的概率与结算逻辑，接受可注入时钟和随机数，供测试使用。
- `dist/rocket.js`、`dice.js` 等：游戏画面、交互和音效。
- `dist/*.css`、图片：各游戏和大厅的样式与素材。
- `tests/`：概率、游戏状态、表现层和平台积分集成测试。
- `docs/rocket-probability.md`：小火箭 97% 理论返还率的推导与边界。

## 后续改进顺序

1. **拆分共享逻辑。** 将 `platform.js` 中的游戏目录、积分账本、页面渲染和消息分发拆成独立模块；统一开局/收取消息的 `roundId` 校验与幂等处理。保留现有引擎测试作为重构依据。
2. **整理主题和素材。** 目前有 24 个 CSS 文件，多次视觉迭代采用样式叠加；收敛为公共颜色/间距变量、公共控件和各游戏专属样式。静态目录约 29.85 MiB（不是首屏下载量），优先按实际引用整理旧图，并用 WebP/AVIF 和合适尺寸降低加载量。
3. **建立源码构建流程。** 待模块边界稳定，再拆分 `src/` 和构建产物 `dist/`，采用多页面构建、资源指纹和格式化工具，替代手写 `?v=...` 版本号。部署到 Vercel 本身无需这一步，也无需先迁移 Next.js。
4. **产品化账户和结算。** 需要跨设备积分或真实账户时，将随机结果、轮次状态、账本和幂等结算放到可信后端与持久化数据库；客户端只提交操作并展示结果。前端的概率模型和 `postMessage` 来源校验无法阻止用户修改自己的客户端。

本次部署适配未改变游戏画面、概率模型或积分规则。
