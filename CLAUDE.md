# 蛙趣蛙趣 · 给 AI 的说明

- 架构、目录、部署、分支状态：`docs/ARCHITECTURE.md`
- 试玩埋点（事件表、代码位置、怎么加、怎么读、Supabase 设置）：`docs/telemetry.md`。改埋点必须同步改这份文档和 `scripts/stats.py`。
- 在线站点测试一律加 `?tm=off`，否则测试数据会混进真实玩家数据。
- 不要把 Supabase 的 secret key 或数据库密码写进仓库；只有 publishable key 可以出现在代码里。
- 部署：`npm run deploy`（会强推 gh-pages，冲掉所有预览子目录）。
- 浏览器 API 只能写在 `src/platform/web.ts`，游戏代码要保持网页和微信小游戏通用。
