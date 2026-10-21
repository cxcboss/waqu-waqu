# 蛙趣蛙趣 · 试玩版

青蛙快递员在河上跳来跳去送包裹的小游戏。手机浏览器直接打开就能玩：

**https://cxcboss.github.io/waqu-waqu/**

- 按住屏幕往下拉、松手，青蛙就往反方向跳（弹弓手势）。
- 站在运输车上点包裹装进背包，跳到对应门牌号的房子上点包裹交给住户。
- 掉进河里点屏幕游泳；太靠下会被甩出屏幕，当天提前下班。
- 一共 3 天，每天结束回猫头鹰总部结算。网址后面加 `?day=2` 可以直接从第 2 天开始。

## 开发

```bash
npm install
npm run dev      # 本地预览，手机连同一个 Wi-Fi 也能打开
npm run build    # 打包到 dist/
npm run font     # 改了文案后重新裁剪字体（霞鹜文楷）
npm run deploy   # 打包并发布到 GitHub Pages（gh-pages 分支）
```

TypeScript + Canvas 2D，没有用游戏引擎。所有浏览器相关的调用都在 `src/platform/web.ts`，
以后做微信小游戏只需要再写一个 `wx.ts` 适配层，游戏代码不用改。

- `src/game/config.ts`：每天的关卡参数和手感数值
- `src/game/level.ts`：河道生成（同一天每次都一样）
- `src/game/play.ts`：玩法；`src/game/hq.ts`：总部结算；`src/game/title.ts`：标题页
- `src/art/`：占位美术（代码绘制的 SVG）。正式美术放进 `public/art/<名字>.png` 并把名字写进
  `public/art/manifest.json`，就会替换同名占位图（名字和尺寸见 `src/art/sprites.ts`）
- `public/audio/`：音效和音乐，来源和授权见 `public/audio/CREDITS.md`
- 试玩数据：游戏会匿名记录游玩过程（不含个人信息），说明和事件表见 `docs/telemetry.md`，
  `python3 scripts/stats.py` 出报告。自己测试时网址加 `?tm=off`，这台设备就不记了
