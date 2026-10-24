# 架构和分支状态

更新：2026-10-22（全部分支合并上线）。

## 一句话

TypeScript + Canvas 2D + Vite，没有游戏引擎。一个 `Game` 对象管画布、存档、音频、美术和埋点，
同一时间只有一个 `Scene`（画面），画面之间用 `game.go(new XxxScene(...))` 切换。
浏览器相关的调用全部在 `src/platform/web.ts`，以后做微信小游戏只要再写一个 `wx.ts` 实现同样的 `Platform` 接口。

## 目录

| 位置 | 内容 |
|---|---|
| `src/main.web.ts` | 网页入口：建 `WebPlatform` 和 `Game`，处理 `?tm=` / `?day=`，把游戏挂到 `window.__game`（测试机器人用） |
| `src/platform/` | `types.ts` 平台接口；`web.ts` 浏览器实现（触摸、音频、存储、`postJson` 发埋点、存图分享） |
| `src/engine/` | `audio.ts` 音效音乐（manifest 驱动）、`math.ts`、`telemetry.ts` 匿名埋点队列 |
| `src/game/game.ts` | `Game`：主循环、存档 `save`（localStorage）、场景切换、成就发放 |
| `src/game/hub.ts` | 主页小镇（启动后的第一个画面）：上班、总部、我的家、福利社、工牌 |
| `src/game/map.ts` | 路线图：选第几天，好评章 |
| `src/game/play.ts` | 一局玩法（最大的文件）：跳跃、游泳轮盘和跳出指针、包裹、司机、套索拽回、拍照 |
| `src/game/level.ts`、`config.ts` | 河道生成（同一天每次一样）、每天参数 `dayConfig` 和手感数值 `TUNING` |
| `src/game/cast.ts`、`resident.ts` | 20 种居民 × 20 种房子（独立搭配），居民状态机（出门→等→接件→回家）和开门 |
| `src/game/hq.ts` | 下班结算：评级、好评章、收入、照片 |
| `src/game/hall.ts`、`album.ts`、`viewer.ts` | 总部大厅（送单/日志/相册/荣誉/动态）、相册存储、看大图 |
| `src/game/home.ts` | 我的家：挂照片、衣柜、个人记录、信箱、布置 |
| `src/game/shop.ts`、`catalog.ts` | 福利社和商店目录；`gearEffects()` 把装备等级换成玩法加成（背包格、跳远、游泳推力） |
| `src/game/career.ts`、`progress.ts`、`stories.ts` | 职级、成就、生涯记录、河湾动态 |
| `src/game/lines.ts` | 随机台词（下班、司机催促 HURRY_LINES、踢下车 KICK_LINES） |
| `src/art/` | 代码绘制的 SVG 占位美术；`sprites.ts` 是精灵表（名字、包围盒、alias、paintedOnly） |
| `public/art/` | AI 画的正式美术 PNG，名字写进 `manifest.json` 就替换同名占位图；没有的自动回退到占位图 |
| `public/audio/` | 音效音乐，来源见 `CREDITS.md` |
| `scripts/` | `deploy.sh` 部署、`stats.py` 数据报告、`telemetry.sql` 建表、`subset_font.py` 裁字体 |
| `docs/telemetry.md` | 埋点说明（事件、字段、位置、怎么加、怎么读） |

## 美术回退

`SpriteBank` 先画代码占位图，`public/art/manifest.json` 里列了的 PNG 加载好后替换。
`paintedOnly` 的精灵（青蛙新姿势、居民、开门图等）没图时借 `alias` 指向的旧图或干脆不画，
代码里用 `sp.has(name)` / `this.pose(name, fallback)` 判断，所以缺图不会报错。

## 部署

- `npm run deploy`：打包后把 `dist/` **强推**到 `gh-pages`，GitHub Pages 约 1 分钟生效：https://cxcboss.github.io/waqu-waqu/
- 旧的预览地址（/preview/、/preview-play/、/preview-residents/、/preview-home/）由 deploy.sh 生成跳转页，自动跳回正式版。
- 以后要再发预览：把 dist 放进 gh-pages 的 `preview-xxx/` 子目录，在现有 gh-pages 上叠普通提交，不要强推；`/preview…/` 路径不发试玩数据。下一次 `npm run deploy` 会冲掉预览。
- 改了文案要先 `npm run font` 重新裁剪霞鹜文楷字体。

## 分支状态（2026-10-22）

| 分支 | 状态 |
|---|---|
| `main` | 正式版，已合并下面全部内容并部署 |
| `ai-art-preview` | 已合并（AI 美术换图） |
| `gameplay-r4` | 已合并（第四轮玩法：游泳轮盘、跳出指针、漂流包裹、司机催促、套索拽回、踢下车） |
| `residents-houses` | 已合并（通过 `residents-on-play`，同一份改动叠在 gameplay-r4 上的版本） |
| `residents-on-play` | 已合并（居民和房子） |
| `home-system` | 已合并（主页、总部大厅、家、福利社、职级成就）；游泳装备加成挪进了新的 `kick()` |
| `gh-pages` | 部署产物，别手改 |

旧分支保留没删，以后的新工作从 `main` 开新分支。

## 部署（两处）
- GitHub Pages：`npm run deploy`（scripts/deploy.sh，强推 gh-pages）。
- Cloudflare Pages：`scripts/deploy-cf.sh`，项目名 `waqu-waqu`，凭据从环境变量 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` 读，不要写进仓库。缓存规则在 `public/_headers`。
- 加载页：`src/game/loading.ts`（贪吃蛙小游戏，素材加载完前显示，明确标注「加载中」）。

## 美术状态（2026-10-23）
- 第四轮美术已全部换进：20 位居民 × 9 姿势、20 张头像、20 座房子、20 张开门图 `door_<房型>`、青蛙 15 个新状态（frog_land 等）。
- 房子门位置（cast.ts 的 door）按画面量过（门扇内框）；开门图按已上线的关门房子对位后裁出门洞。
- 换图脚本在项目文件 wa-qu/art-pipeline/（round4.py 居民/房子，round4b.py 开门图/青蛙，compress.py 压缩）。

## 美术状态（2026-10-24，第五轮场景新增）
- 已换进：主页黄昏河湾整图（`hub_bg.jpg`，底图里自带小路、桥、茶壶家和一辆卡车；总部、福利社的黄昏版建筑叠在两块空地上，运输车图盖住底图里的卡车，主页用 `hotspot()` 给底图里的「我的家」和卡车做点击区）、猫头鹰 4 个姿势（总部按标签换）、总部 5 个标签图标、7 张职级工牌、22 枚成就勋章（`medal_<id>`，没拿到的用 `_off` 灰版）、4 个相框（竖版，挂墙时横着转 90°，见 `drawFrame`）、家的日夜窗户、信箱、账本、开门衣柜、8 件新家具（已进 `catalog.ts`）、福利社仓鼠 4 个表情、柜台、货架、特价牌、礼物盒、分类图标、装备 2–5 级图标 `gear_<id>_lv<n>`。
- 都是 lazy 精灵（`sprites.ts` 里「Scene art」那一段），场景构造时 `ensure()`，没图自动回退到原来的代码绘制。
- 还没有：白天版主页（`hub_bg` 白天、`hub_hq/hub_shop/hub_home` 三栋白天建筑）、帽子/围巾/原 8 件家具/邮差包等装备 1 级图标（旧清单「主页和个人系统」32 张还没出图）；新出的 `hub_tree_*`、`hub_flowers_*`、`hub_bridge`、`hub_lamp`、`hub_signpost` 以及 `hub_*_dusk` 里的 `hub_home_dusk` 已入库但暂未使用（底图已自带这些）。
- 换图脚本：项目文件 `wa-qu/art-pipeline/round5.py`（裁掉透明边、按 final_size 放进画框、256 色 PNG、勋章另出灰版）。
