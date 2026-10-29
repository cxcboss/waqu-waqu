# 架构和分支状态

更新：2026-10-27（`release-polish` 分支：场景改代码绘制、音效音乐、七章 35 天和故事线，见文末）。

## 一句话

TypeScript + Canvas 2D + Vite，没有游戏引擎。一个 `Game` 对象管画布、存档、音频、美术和埋点，
同一时间只有一个 `Scene`（画面），画面之间用 `game.go(new XxxScene(...))` 切换。
浏览器相关的调用全部在 `src/platform/web.ts`，微信小游戏的在 `src/platform/wx.ts`，两者实现同一个 `Platform` 接口（`types.ts`），游戏代码不分平台。

## 目录

| 位置 | 内容 |
|---|---|
| `src/main.web.ts` | 网页入口：建 `WebPlatform` 和 `Game`，处理 `?tm=` / `?day=`，把游戏挂到 `window.__game`（测试机器人用） |
| `src/main.wx.ts` | 微信小游戏入口：建 `WxPlatform` 和 `Game`，挂到 `GameGlobal.__game`（开发者工具控制台用） |
| `src/platform/` | `types.ts` 平台接口；`web.ts` 浏览器实现（触摸、音频、存储、`postJson` 发埋点、存图分享）；`wx.ts` 微信小游戏实现（见文末「微信小游戏」） |
| `src/engine/` | `audio.ts` 音效音乐（manifest 驱动，见 `docs/audio.md`）、`math.ts`、`telemetry.ts` 匿名埋点队列 |
| `src/game/game.ts` | `Game`：主循环、存档 `save`（localStorage）、场景切换、成就发放 |
| `src/game/hub.ts` | 主页小镇（启动后的第一个画面）：上班、总部、我的家、福利社、工牌 |
| `src/game/map.ts` | 路线图：选第几天，好评章 |
| `src/game/play.ts` | 一局玩法（最大的文件）：跳跃、游泳轮盘和跳出指针、包裹、司机、套索拽回、拍照，以及各章机关的运动、判定和绘制 |
| `src/game/level.ts`、`levelfeats.ts`、`config.ts` | 河道生成（同一天每次一样）；`levelfeats.ts` 往河道里放各章机关；`config.ts` 是七章 35 天的 `DAYS`、隐藏关 `SECRET`、章节 `CHAPTERS` 和手感数值 `TUNING` |
| `src/game/weather.ts` | 每章的天气和水色（雨、雪、风、夜、烟花），画在河上 |
| `src/game/ending.ts` | 年终总结（第 30 天第一次通过后）：除夕烟花和几页小故事，最后去路线图看第七章 |
| `src/game/cast.ts`、`resident.ts` | 20 种居民 × 20 种房子（独立搭配），居民状态机（出门→等→接件→回家）和开门 |
| `src/game/hq.ts` | 下班结算：评级、好评章、收入、照片；机关一栏；失败两次「慢一点再试」、三次「跳过这一天」 |
| `src/game/hall.ts`、`album.ts`、`viewer.ts` | 总部大厅（送单/日志/相册/荣誉/动态）、相册存储、看大图 |
| `src/game/home.ts` | 我的家：挂照片、衣柜、个人记录、信箱（乌龟爷爷的信 / 路上捡的信，集齐 30 封开「第0号快递」）、布置 |
| `src/game/shop.ts`、`catalog.ts` | 福利社和商店目录；`gearEffects()` 把装备等级换成玩法加成（背包格、跳远、游泳推力） |
| `src/game/career.ts`、`progress.ts`、`stories.ts` | 职级、成就、生涯记录、河湾动态 |
| `src/game/lines.ts` | 随机台词（下班、司机催促 HURRY_LINES、踢下车 KICK_LINES）、路上捡的信 `LETTERS`、乌龟爷爷的 30 封信 `STORY` 和第一封 `FIRST_LETTER` |
| `src/game/sound.ts` | 每章的配乐和环境声、各场景配乐 `SCENE_MUSIC`、居民说话的声音 |
| `src/art/` | 代码绘制：`kit/` 手账风基础件（墨线、纸纹、图标、勋章、相框、招牌、时段配色）；`river.ts` 河上的机关（乌龟、石头、落叶、浮冰、薄冰、水坝、栈桥、渡船、吊钩、海鸥、大鹅、烟花）；`village.ts`/`room.ts`/`furniture.ts` 场景；`sprites.ts` 是精灵表（名字、包围盒、alias、paintedOnly，`codeSprite` 注册代码精灵） |
| `public/art/` | AI 画的正式美术 PNG，名字写进 `manifest.json` 就替换同名占位图；没有的自动回退到占位图 |
| `public/audio/` | 音效音乐，来源见 `CREDITS.md`；由 `tools/audio/` 生成，场景配乐在 `src/game/sound.ts`，说明见 `docs/audio.md` |
| `scripts/` | `deploy.sh` 部署、`stats.py` 数据报告、`telemetry.sql` 建表、`subset_font.py` 裁字体、`build_wx.py` 打包微信小游戏 |
| `wx/` | 小游戏工程要带的固定文件：分享图 `share.jpg`（500×400）、字体许可 `OFL.txt` |
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

## 美术状态（2026-10-24，第五轮场景新增；场景部分已被 10-27 的代码绘制取代）
- 已换进：主页河湾整图、猫头鹰 4 个姿势（总部按标签换）、总部 5 个标签图标、7 张职级工牌、22 枚成就勋章（`medal_<id>`，没拿到的用 `_off` 灰版）、4 个相框（竖版，挂墙时横着转 90°，见 `drawFrame`）、家的日夜窗户、信箱、账本、开门衣柜、8 件新家具（已进 `catalog.ts`）、福利社仓鼠 4 个表情、柜台、货架、特价牌、礼物盒、分类图标、装备 2–5 级图标 `gear_<id>_lv<n>`。
- 都是 lazy 精灵（`sprites.ts` 里「Scene art」那一段），场景构造时 `ensure()`，没图自动回退到原来的代码绘制。
- 第五轮已入库但暂未使用：`hub_tree_*`、`hub_flowers_*`、`hub_bridge`、`hub_lamp`、`hub_signpost`（第六轮底图自带这些）。

## 美术状态（2026-10-24，第六轮补全缺失；主页和家已被 10-27 的代码绘制取代）
- 主页：`hub_bg_day.jpg` / `hub_bg_eve.jpg`（1024×1536，三块空地）+ 三栋建筑 `hub_hq/hub_shop/hub_home` 和 `_eve` 夜景版。`HubScene.night`（19:00–6:00，与家里窗户同一规则）选日夜；建筑用 `place()` 叠在空地上（位置是底图比例 `at(u,v)`，改底图要重量），运输车由代码画（`drawTruckBase` + `truck_blue`，缩放 0.62）。旧的 `hub_bg.jpg` 和 `hub_*_dusk` 已删除。
- 我的家：`home_room.jpg` 房间底图，`home_bed/wardrobe/desk` 和原 8 件家具 `deco_*` 换成画好的。
- 衣帽装备：8 顶帽子、3 件围巾/领结/相机、邮差包/弹力鞋/脚蹼 1 级图标（`gear_bag/shoe/fin`，`gearIcon` 在 1 级自动用它）。
- 换图脚本：`wa-qu/art-pipeline/round6.py`（原图先在本机裁到非透明边并缩到 800px 再传，因为 Mac 文件夹直传 2–3MB 大图会超时；背景存 jpg）。
- 换图脚本：项目文件 `wa-qu/art-pipeline/round5.py`（裁掉透明边、按 final_size 放进画框、256 色 PNG、勋章另出灰版）。

## 美术状态（2026-10-27，场景改代码绘制）
- 主页、路线图、总部、我的家、福利社的场景和道具都改成代码绘制（河湾手账 kit，`src/art/kit/`），网页和小游戏通用：
  - 主页小镇 `village.ts`（hub.ts 注册 `hub_hq/hub_shop/hub_home/hub_van`，清晨/白天/黄昏/夜晚四套，名字写成 `name:<tod>`）；路线图 `mapart.ts`（每章一个季节，河道分块烘焙）。
  - 室内 `room.ts`（家的墙纸、护墙板、地板和窗光，总部办公室和柜台、实时走的挂钟，福利社货架和柜台，礼物盒，7 张工牌）和 `furniture.ts`（床、书桌、衣柜、信箱、窗户和 16 件家具）。`codeart.ts` 用原来画好的图的名字和边界把它们注册成代码精灵，所以各场景的摆放代码基本没变。按时段变化的几件（家的窗户、总部房间、地毯、盆栽、坐垫、河湾旗）用 `todSprite(name, tod)` 取名字。
  - 成就勋章、相框、标签和分类图标用 kit 的 `medal()`、`frame()`、`icon()`；特价牌用 `chalkboard()`，总部招牌用 `woodSign()`。
- 删掉了被替换的 113 张 WebP（约 2.4 MB）和 sprites.ts 里对应的定义、shapes 里的旧占位图。还在用画好的：居民、房子、开门图、青蛙、猫头鹰、仓鼠、包裹、荷叶、河、帽子围巾和装备图标。
- `drawBaked`（kit/canvas.ts）的烘焙缓存按最近使用淘汰，总预算约 600 万像素；整屏背景（主页、家）各占一份。

## 首次加载优化（2026-10-25）
- 美术全部是 WebP：`scripts/optimize_art.py` 把 `public/art/` 里的 png/jpg 转成 webp（普通图质量 72，整屏背景缩到 1.2 倍设计宽度，其余最多 2 倍）、删原图、重写 manifest.json（只列精灵名，扩展名固定 .webp）。**新图换进来先放 png/jpg 再跑这个脚本**，不要对已有 webp 重复压缩。`scripts/art_design_widths.json` 记各精灵的设计宽度。不支持 WebP 的老浏览器会回退到代码绘制的占位图。美术目录 19 → 约 5 MB。
- 分阶段加载（`sprites.ts` 的 `CORE`/`PLAY`、`Game.go`）：加载屏只等字体、脚本、主页自己的图和几张必需的小图（`CORE`），约 1.1 MB；等加载屏结束后才后台拉剩下的非 lazy 美术，先拉一天玩法要用的（`PLAY`：青蛙各姿势、包裹、荷叶、河……），再拉总部/家/福利社等。没到的精灵 `draw` 会跳过并优先请求。除主页外的场景在 `go()` 里检查：美术没到齐就先显示「加载中…」小卡片，到齐才切换（`play` 只等 `PLAY` 那一组）。新加非 lazy 精灵不用改任何东西；主页要用的才加进 `CORE`。
- `public/sw.js`：Service Worker，同源资源先用缓存、后台更新（二次打开几乎不用联网）。新版本要多开一次才生效。只在 https 且非 dev 时注册（`main.web.ts`）。
- 埋点请求 8 秒超时，音效降码率且每次只并发 3 个，并且在加载屏结束后才开始拉。

## 章节和故事（2026-10-27，`release-polish`）
- 七章 35 天（`config.ts` 的 `CHAPTERS`、`DAYS`）：一春 1–5、二夏 6–10、三雨季 11–15、四秋 16–20、五冬 21–25、六港口 26–30、七早春环河联运 31–35（前面的机关混在一起）。`YEAR_END = 30` 是一年的最后一天。
- 每章 4–5 个机关，一天教一个（`DayConfig.teach`，第一次碰到时出 `feat_hint` 说明和猫头鹰提示）。机关的数据在 `level.ts` 的 `Plat`/`Order` 上（`bud`、`hp`、`ang`、`fragile`、`keep`、`ret`、`nag` 等），放置在 `levelfeats.ts`，行为和绘制在 `play.ts`（搜 `movePlat`、`drawPlat`、`featSeen`），画法在 `art/river.ts`。
- 易碎/冷藏/保温件坏了照样能送，只扣评分（`hq.ts` 的分数公式），总部结算有一栏机关成绩（`featRow`），三枚章里的「今日挑战」按每天的机关定（`progress.ts` 的 `earnedStamps`）。
- 卡关帮助：同一天连续没过两次，结算出「慢一点再试」（`save.assist[day]`，河水 0.9 倍速，过了就取消）；三次出「跳过这一天」（`save.skipped`，开下一天但这一天拿不到章，路线图上标「跳过」，回来补跑就去掉）。
- 故事线：第 1–30 天每天河上漂着乌龟爷爷（小龟）年轻时写给去出海的老朋友阿灰（鹈鹕大叔）的一封信（`STORY`，`save.story` 记找到的天）。集齐 30 封 `save.secret = 1`，信箱出现「第0号快递」（第 0 天，`SECRET` 配置，`dayLabel(0)`），把第一封信送到上游的阿灰家后 `secret = 2`，能读第一封信。
- 年终总结：第 30 天第一次通过后结算的下一步按钮变成「年终总结」（`save.ending` 记看过），之后去路线图第 31 天。

## 微信小游戏（2026-10-29，`wechat-minigame`）
- 打包：`npm run build:wx`（`scripts/build_wx.py`）生成 `dist-wx/`，用微信开发者工具「导入」这个文件夹就能跑。默认用游客 AppID（只能在开发者工具里跑）；`npm run build:wx -- --appid wx…` 换成正式 AppID 才能真机预览和上传。需要 node、Pillow、fontTools、numpy（`pip install pillow fonttools brotli numpy`）和 ffmpeg，有 pngquant 会把图压到 256 色。
- 包的结构（主包限 4 MB，总共限 30 MB；现在主包约 1.9 MB，总共约 12 MB）：
  - 主包：`game.js`（esbuild 打的整个游戏）、`fonts/`（霞鹜文楷子集转成 TTF，字体内的名字改成 `WK`/`WKB`，因为 `wx.loadFont` 按字体文件里写的名字注册）、`core/art/`（`CORE` 那些首屏精灵、`manifest.json`、`files.json` 精灵名→文件）、`core/share.jpg`。
  - 分包 `art/`：其余精灵，`parallelPreloadSubpackages` 让它跟主包一起下载；分包 `audio/`：`public/audio`，但每首音乐剪成正好一个循环（小游戏里音乐用系统播放器整首循环，见 `docs/audio.md`），剪好的缓存在 `node_modules/.cache/wx-audio`。
  - 小游戏包不收 WebP、woff2、md，所以打包时 WebP 转回 PNG（不透明的转 JPEG），转好的缓存在 `node_modules/.cache/wx-art`。
- `wx.ts` 把网页路径翻译成包内路径（`where()`：`art/x.webp` 查 `files.json`、`.woff2` 换 `.ttf`），读分包里的文件前先等 `wx.loadSubpackage`（失败会重试 5 次）。
- 和网页版的不同：
  - 加载页没有贪吃蛇（几秒就加载完），只有进度条、一只在荷叶间跳的青蛙；底部显示「健康游戏忠告」全文，左上角「8+ 适龄提示」，至少停 3 秒，加载完自己进（`loading.ts` 的 `mini`）。
  - 顶部安全区让开右上角胶囊按钮（`safeTop` 取胶囊底边 +6）。底部安全区在系统给的值上多留 10、至少 24（`wx.ts` 的 `BOTTOM_AIR`/`BOTTOM_MIN`），让开大圆角和底部横条。
  - 声音的特殊处理见 `docs/audio.md`「播放器」最后一条（音乐走 InnerAudioContext，音效播完就断开节点）。
  - 内存：微信的离屏画布在脚本内存之外，垃圾回收不着急收，所以缓存丢掉的画布会先缩成 1×1（`releaseCanvas`）；每次换场景调一次 `wx.triggerGC`（`platform.gc`）；内存告警时丢掉解码的声音和烘焙缓存（`game.ts`）。
  - **实时日志**（`platform.log`，只在手机上报，开发者工具不报）：小游戏后台「WE分析 → 性能质量 → 实时日志」，用关键字 `waqu` 或 `b<构建号>` 搜。记的是启动时的机型和系统、分包下载用时、前后台切换、音频中断、内存告警、报错、每次换场景，以及每 10 秒一行心跳（场景、帧率、卡顿帧数、画布缩放、声音状态：`alive` 是还连着的音效数、`song` 是正在放的音乐和位置）。每次启动最多 2000 行。真机上闪退、没声音时先看这里。
  - 存照片是直接存进手机相册（`saveImageToPhotosAlbum`，没权限会引导去设置），没有「长按图片保存」（`platform.longPressSave = false`）。
  - 分享走右上角菜单和 `shareAppMessage`（分享给朋友、朋友圈），配图是当前画面裁 5:4，没有就用 `core/share.jpg`。
  - 有新版本时弹窗问要不要重新打开（`getUpdateManager`）。
  - **默认不发试玩数据**：小游戏只能请求后台配好且已 ICP 备案的「服务器域名」，Supabase 的域名配不进去。要发得先把数据中转到自己备案的域名，再用 `--tm` 打包（见 `docs/telemetry.md`）。
- 测试：没有官方模拟器可在云端跑，用的是一个浏览器里的 `wx` 假接口（会检查分包加载了才读里面的文件）加测试机器人；真机效果以开发者工具和手机预览为准。
- 上架步骤（注册、软著、自审报告、备案、隐私、提审）见上架清单：https://claude.ai/artifact/HJeppnDd52Y5vBzfpF8Ahj
