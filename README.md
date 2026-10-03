# PLAYROOM

金币扫雷、小火箭、三骰挑战、闪电跑道和星际赛马的网页游戏 Demo。前端负责画面与操作，Node 服务端负责开局、随机结果、积分和结算。使用模拟积分，没有充值、提现或真实资产交易。

## 本地运行

需要 Node.js **24.x**；没有第三方 npm 包依赖。

```sh
npm run build
npm start
```

打开 `http://127.0.0.1:8765/`。`npm start` 同时提供 `dist/` 页面和 `/api/playroom`，本地账本保存在 `.local/playroom.sqlite`。刷新页面、切换游戏或重启服务后，可以恢复同一游客的积分和轮次。不要使用 Python 静态服务器或直接打开 HTML，这一版需要游戏 API。

可通过 `PORT` 改端口，`PLAYROOM_DB_PATH` 改本地数据库路径。默认不加载 `.env`；如需本地使用云端配置，先设置环境变量，或执行 `node --env-file=.env scripts/dev-server.cjs`。环境变量名称见 `.env.example`。

游客标识使用 HttpOnly、SameSite=Strict Cookie；HTTPS 部署额外启用 Secure。Cookie 有效期七天，服务端闲置数据七天过期。清除浏览器数据、换浏览器或 Cookie 过期会创建新的体验会话，不提供跨设备身份恢复。每个新游客获赠 1,000 模拟积分。

## 检查与构建

```sh
npm run check
npm test
npm run build
```

编辑 `src/` 和 `server/`，不要编辑生成的 `dist/`。构建先执行语法、资源引用、私有文件边界检查和全部测试，随后从 `src/` 生成有自动资源版本的静态产物。检查失败不会替换上一次可用的 `dist/`。

`node scripts/build.cjs` 与 `npm run build` 等价。测试包含概率规则、画面行为、服务端请求验证、并发结算、会话隔离、断线重试与 SQLite 重启恢复；HTTP 测试需要允许监听本机临时端口。Redis 测试验证适配协议和原子操作指令；实际云端数据库与 Vercel 部署仍需要配置后联调。

## Vercel 部署

在 Vercel 导入 GitHub 仓库 `pearsonchang/Games`：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Other |
| Root Directory | `./` |
| Node.js Version | `24.x` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | 留空 |

根目录 `api/playroom.js` 是 Node Function；`server/` 随函数打包，不能作为静态目录发布。`vercel.json` 已指定函数私有文件与页面输出设置。

**部署前需配置持久化数据库。** 为 Preview 和 Production 分别设置以下服务端变量：

| 环境变量 | 用途 |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis HTTPS REST 地址 |
| `UPSTASH_REDIS_REST_TOKEN` | 对应数据库的服务端读写令牌 |

建议预览与生产使用不同数据库，避免混用积分。变量不要加公开前缀、写进 `src/` 或提交到 Git。Vercel 生产环境不会使用内存或临时 SQLite 作为账本；缺少数据库配置时 API 返回不可用并暂停游戏，不会退回浏览器发积分。

配置后重新部署，检查根页面、五款游戏、刷新恢复、`/palettes` 和静态资源。`cleanUrls` 支持独立游戏页面；不要添加将 `/api/*` 或所有页面重写到 `index.html` 的规则。

仓库中的 `.openai/hosting.json` 是旧 Sites 静态网站的历史配置。这一版需要 Node API，**不能只打包 `dist/` 上传旧的静态托管来完成发布**。本次代码更改不会创建云数据库、Vercel 项目或自动更新旧 Sites 网站。

官方参考：[Node Function](https://vercel.com/docs/functions/runtimes/node-js)、[Node 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Upstash REST API](https://upstash.com/docs/redis/features/restapi)。

## 服务端边界

- 五款游戏共用服务端账本。客户端只提交开局、选格、收取、选马等意图；不接受客户端余额、奖励金额、中奖结果、随机种子或时钟。
- 扫雷完整雷区只存在服务端。进行中的响应仅包含已揭开的格子、玩家标旗和公开赔率信息；不存在浏览器 `MinesRound` 实例或可调用的积分 `credit()`。
- 雷区在开局时固定，54 格中 10 雷、无首次保护、无数字提示，原概率和奖励规则保留。
- 每次操作绑定游客、游戏、轮次和请求 ID；扫雷额外绑定棋盘版本。网络重试复用同一个 ID，不能再次扣分或结算。
- 私有游戏状态、积分账本、历史记录和操作回执作为一个整体进行原子版本更新。SQLite 使用条件更新，Redis 使用 Lua 原子比较与更新；提交失败不返回“成功到账”。
- 定时游戏按服务端时间推进。离开页面不取消已支付的轮次；下一次同步补齐结果，不依赖浏览器定时器来决定输赢。
- 浏览器只能缓存公开画面数据。修改本地显示不会改变服务端余额。

## 随机数与后续链上接入

`server/random.cjs` 提供独立的随机来源接口，当前默认使用 Node 加密随机数。未实现 Web3 钱包登录、VRF、链上结算或可验证公平证明。后续接入 VRF 或承诺揭示方案时，需要先绑定轮次与随机证明，再生成并保存结果；不能提前向客户端公开当前雷区的种子。

当前游客赠送属于 Demo 体验机制，清 Cookie 仍可创建新游客。这次修复的是读取隐藏雷区和伪造现有会话积分，不是正式账户、女巫攻击防护或真实资产系统。对接可兑换资产前，需要真实身份/钱包绑定、唯一赠送规则、限流和持久账户账本。

## 代码结构

- `src/platform-api.js`：同源 API 客户端、公开状态缓存与失败重试。
- `src/platform-bridge.js`：校验 iframe 来源，转发允许的操作并同步画面。
- `src/platform.js`、`platform-view.js`、`platform-catalog.js`：大厅导航、页面与游戏目录。
- `src/*-rules.js`：画面需要的公开常量、赔率和几何数据。
- `src/game.js`、`rocket.js` 等：游戏画面、交互与音效。
- `server/engines/`：五款游戏的私有状态与概率规则。
- `server/service.cjs`：操作校验、轮次、回执去重与统一事务。
- `server/wallet.cjs`：整数小数位记账和交易去重。
- `server/store.cjs`：本地 SQLite 与云端 Redis 持久化。
- `server/http.cjs`、`api/playroom.js`：会话、请求来源与 Vercel 入口。
- `scripts/dev-server.cjs`：本机页面和 API 服务，只公开 `dist/`。
- `scripts/build.cjs`：检查、测试和可重复静态构建。
- `tests/`：游戏、表现层、协议、权限边界、并发和构建回归测试。
- `docs/rocket-probability.md`：小火箭 97% 理论返还率推导。

现有美术和颜色保持原样；无损 WebP 素材与自动资源版本继续沿用。
