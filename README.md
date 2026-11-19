# 蛙趣蛙趣 · 试玩版

青蛙快递员在河上跳来跳去送包裹的小游戏。手机浏览器直接打开就能玩：

**[打开试玩版](https://cxcboss.github.io/waqu-waqu/)**

试玩和直播使用同一个版本。35 天和隐藏关「第0号快递」随时可玩，金币无限，商店物品和装备已开放，补给可免费领。页面没有广告。

左上角「设置」里可开启自动玩。自动玩默认关闭，从主页开启则从第 1 天开始，结算通过后继续下一关。送件时优先踩近处的荷叶。五档速度会调整每跳的随机蓄力时间和取件、送件节奏。「错误率」可选 0 错误、少错误和多错误，默认 0 错误。触碰游戏画面可以接手。直播也可用[自动开启链接](https://cxcboss.github.io/waqu-waqu/?auto=1)。

- 按住屏幕往下拉、松手，青蛙就往反方向跳（弹弓手势）。
- 站在运输车上点包裹装进背包，跳到对应门牌号的房子上点包裹交给住户。
- 掉进河里用右下角轮盘游泳，游近荷叶时点屏幕、指针在绿区就跳上去；太靠下会被甩出屏幕，当天提前下班。
- 打开先到主页小镇，可去上班、总部大厅、我的家或福利社。每天结束回猫头鹰总部结算。网址后面加 `?day=2` 可以直接从第 2 天开始，`?day=0` 打开隐藏关。

## 开发

```bash
npm install
npm run dev      # 本地预览，手机连同一个 Wi-Fi 也能打开
npm run build    # 打包普通网页版到 dist/
npm run build:trial  # 打包全解锁的试玩和直播版
npm run font     # 改了文案后重新裁剪字体（霞鹜文楷）
npm run deploy   # 打包试玩版并发布到 GitHub Pages（gh-pages 分支）
```

TypeScript + Canvas 2D，没有用游戏引擎。所有浏览器相关的调用都在 `src/platform/web.ts`，
以后做微信小游戏只需要再写一个 `wx.ts` 适配层，游戏代码不用改。

- `src/game/config.ts`：每天的关卡参数和手感数值
- `src/game/level.ts`：河道生成（同一天每次都一样）
- `src/game/play.ts`：玩法；`src/game/hq.ts`：下班结算；`src/game/hub.ts`：主页（小镇）；`hall.ts` 总部大厅、`home.ts` 我的家、`shop.ts` 福利社；`career.ts` 生涯记录、职级和成就；`catalog.ts` 商店目录和装备数值
- `src/art/`：占位美术（代码绘制的 SVG）。正式美术放进 `public/art/<名字>.png` 并把名字写进
  `public/art/manifest.json`，就会替换同名占位图（名字和尺寸见 `src/art/sprites.ts`）
- `public/audio/`：音效和音乐，来源和授权见 `public/audio/CREDITS.md`
- 试玩版默认关闭匿名统计。事件表见 `docs/telemetry.md`，`python3 scripts/stats.py` 出报告。
- 架构和分支状态见 `docs/ARCHITECTURE.md`；给 AI 的约定见 `CLAUDE.md`
