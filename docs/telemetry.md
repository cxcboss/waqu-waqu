# 试玩数据（匿名游玩统计）

> 给以后接手的人或 AI：这份文档是埋点的唯一说明。改了埋点（加、删、改字段）就同步改这里和 `scripts/stats.py`。
> 快速入口：[每一行](#每一行) · [事件](#事件) · [埋点在代码哪里](#埋点在代码哪里) · [怎么加一个新埋点](#怎么加一个新埋点) · [读数据](#读数据statspy) · [Supabase 设置](#supabase-设置不含密钥)

测试版会把玩家的游玩过程匿名记下来，方便不问玩家也能看出卡在哪。不收集任何个人信息：
只有一个随机生成、存在玩家设备上的玩家 ID，加上粗略的设备情况（系统、浏览器或 App、屏幕尺寸）
和游戏里发生的事。不弹任何提示。

- 代码：`src/engine/telemetry.ts`（排队、存本地、分批发送，平台无关）；发送和设备信息在
  `src/platform/web.ts`（`postJson` / `deviceInfo` / `onError`），小游戏版用 `wx.request`、`wx.getSystemInfoSync`、`wx.onError` 实现同样三个接口即可。
- 埋点：`src/game/play.ts`（`this.log(...)`）、`hq.ts`、`map.ts`、`game.ts`。
- 存储：Supabase 的 `events` 表，建表语句 `scripts/telemetry.sql`。项目地址和 publishable key 写在
  `telemetry.ts` 顶部（这把钥匙本来就是公开放在网页里的，只能加数据和读数据，不能改、不能删）。
  没配置时事件先存在玩家设备上（最多 3000 条），配置好后玩家下次打开会补发。
- 项目：`https://oitbtkfwybkuqddqggsg.supabase.co`（用户的 Supabase 组织 waqu，东京区，免费版）。
- 读数据：`python3 scripts/stats.py`（出一份中文报告），`--dump rows.json` 存原始数据，
  `--since 2026-10-22`、`--build <commit>`、`--exclude <pid>` 过滤。玩家 ID 以 `claude-` 开头的是
  Claude 自己的连通测试，报告里自动去掉。
- 排除自己：网址加 `?tm=off`，这台设备以后都不记（`?tm=on` 恢复）。本地开发服务器默认不记，
  要测试加 `?tm=on`。自动测试机器人请用 `?tm=off`。

## 每一行

| 列 | 意思 |
|---|---|
| `id` | `<sid>-<序号>`，设备上生成；重复发送会被忽略 |
| `at` | 服务器收到的时间（UTC） |
| `pid` | 随机玩家 ID（同一台设备同一个浏览器不变） |
| `sid` | 一次打开网页 |
| `v` | 版本：`<commit>.<月日>` |
| `ev` | 事件名，见下表 |
| `day` / `run` | 第几天 / 这次打开里的第几局 |
| `t` | 本局第几秒（暂停不算） |
| `ts` | 打开网页后的毫秒数 |
| `d` | 事件详情（JSON）。局内事件都带 `p`：路线进度 0～1 |

## 事件

**打开和设备**

- `open`：`os`、`browser`（wechat/qq/safari/chrome…）、`w`/`h`（CSS 像素）、`dpr`、`touch`、`standalone`、`visit`（这台设备第几次打开）、`unlocked`（已解锁到第几天）、`coins`、`sound`、`stamps`（好评章总数）、`jump`（用 `?day=` 直接进的；10-26 起只有开发环境、`?tm=off` 或这台设备已解锁的天才会生效，超过最后一天按最后一天算，10-27 起是第 35 天）
- `loaded`：`ms` 加载耗时
- `hide` / `show`：切到后台 / 回来，`scene`（loading/hub/map/play/hq/hall/home/shop，10-27 起还有 ending；10-22 前的版本还有 title）。`hide` 之后没有 `show` 通常就是关掉了
- `error`：`msg`、`where`（文件:行:列 + 调用栈前几行，压缩后的代码，对照同版本 `vite build --sourcemap` 查）、`scene`
- `sound`：`on`、`scene`

**主页（10-22 起，代替原来的标题页）**

- `hub`：进主页 `unlocked`、`coins`、`notes`（没读的河湾动态条数）· `hub_go`：`to`（hq 总部 / shop 福利社 / home 我的家 / work 上班 / map 路线图）
- `profile`：打开工牌 · `rename`：改名 `len`（几个字）
- `ach`：达成成就 `id`、`scene`（在哪个画面达成的）

**路线图、结算**

- `map`：`sel`、`unlocked` · `map_go` / `map_back`：`sel`、`sec`（在路线图待了几秒）· `map_locked`：点了没解锁的 `day`
- `hq`：`grade`（10-26 起没通过的一天一律记 D，S 还要求全部送达）、`pass`、`stamps`（三枚章）、`fresh`（本局新拿的）、`income`（含升职加薪和新章奖励）、`coins`、`photos`、`rankUp`（升到的职级，没升是 null）、`ach`（这一局达成的成就 id）、`news`（新增的河湾动态条数）
- `hq_btn`：`id`（retry/home/next；10-27 起还有 slow 慢一点再试 / skip 跳过这一天 / ending 年终总结）、`open`（下一天是否已解锁）、`sec`（结算页看了几秒）
- `hq` 10-27 起多两个字段：`fails`（这一天连续没通过几次，过了是 0；两次起出「慢一点再试」，三次起出「跳过这一天」）、`story`（这一局捡到的乌龟爷爷的第几封信，没捡到是 null）。第 0 天是隐藏关「第0号快递」
- `ending`（10-27）：第 30 天第一次通过后看年终总结 `found`（乌龟爷爷的信找到几封）、`secret`（0 没开 / 1 第0号快递已开 / 2 已送到）· `ending_page`：翻到第 `i` 页（0 除夕夜、1 这一年、2 猫头鹰、3 信、4 新年快乐），没翻到 4 就是中途跳出去了
- `photo`：看大图 `i`、`kind` · `photo_save`：`res`（shared/downloaded/longpress/cancelled/failed）
- `photo_keep`：点照片上的 ♥ `i`、`kind`、`on`（true 收进相册 / false 取消）、`n`（相册现在几张）

**总部大厅、我的家、福利社**

- `hall`：进总部 `tab`、`notes` · `hall_tab`：`tab`（送单/日志/相册/荣誉/动态）· `album_view`：看相册大图 `i`、`n` · `album_del`：移出相册后剩 `n` 张
- `home`：进家 `frames`（墙上挂了几张）、`decos`（有几件家具）· `home_open`：`what`（hang 挂照片 / wardrobe 衣柜 / records 个人记录 / letters 信箱 / decor 布置）
- `story_read`（10-27）：在信箱里读乌龟爷爷的第 `n` 封信（0 是送到阿灰手里的第一封）· `secret_start`：从信箱点「去送信」开始第0号快递
- `photo_hang`：挂上照片 `slot`、`frame`（相框）、`hung`（一共挂了几张）· `wear`：换装 `slot`（hat/neck）、`id`（null 是不戴）
- `shop`：进福利社 `tab`、`coins` · `shop_tab`：`tab` · `shop_buy`：`what`（装备是 `bag3` 这样的「装备+升到的级」，其余是物品 id）、`price`、`coins`（买完剩多少）

**一局**

- `run_start`：`attempt`（这台设备第几次玩这一天）、`unlocked`、`best`、`stamps`；10-22 起还有 `gear`（开局时商店装备等级，如 `{bag:1, shoes:0, fins:2}`）、`bag`（加上邮差包后今天背包几格）；10-27 起还有 `assist`（这一天开了「慢一点」，河水 0.9 倍速）、`fails`（开局前这一天已经连续没过几次）
- `step`：新手步骤切换 `from` → `to`、`sec`（上一步停留秒数）。`from: intro` 的 `sec` 就是开工说明卡看了多久；第 1 天依次 pick（点包裹）→ aim（拉）→ go（跳去房子）→ deliver（点卡片交件）→ refill（回车）；`rescue` 是第一次落水的教学（第四轮起教方向轮盘，碰一下轮盘才继续）
- `step_fix`：新手步骤等的前提不成立了（比如该点卡片时青蛙已经不在车上/房子上、回车时包里又有了包裹），自动跳到下一步，免得河水一直停着：`from`、`to`、`state`、`on`、`bag`（包里几个）。正常玩不该出现，出现就说明引导还有漏洞（10-26 起）
- `jump`（落地时记一条）：`pow` 力度 0～1、`dx`/`dy` 手指拉的方向（青蛙往反方向跳；`dy<0` 是手指往上拉、青蛙往下跳）、`held` 按了几秒、`from` 起跳处、`w` 背包重量、`fy` 起跳时在屏幕的高度（0 顶 1 底）、`smog` 在尾气里、`step`、`dist`、`on` 落点（lily/log/house/truck/bank/water）；落水时还有 `near`（离最近落脚点的距离）、`to`（那是什么）、`short`（true 跳近了 / false 跳远了）；第 1 天引导那一跳有 `target`（是否跳中了引导的荷叶）
- `tap`：按了一下没拉开（想跳却只是点），`len`、`held`、`under`（手指下面是什么）、`on`、`step`（每局最多记 20 条）
- `tired`：按住超过 3 秒脚累了，`step`、`on`
- `miss`：在等别的操作时点了没用的地方，`where`：intro（说明卡上没点按钮）/ pick / deliver（引导要点卡片时）/ rescue（落水教学时没碰轮盘）/ cod（找零时没点到选项）（每种每局最多 5 条）
- `idle`：隔了 ≥8 秒才再点屏幕，`sec`、`step`、`state`、`on`（站在车上等房子是正常的）
- `fall`：落水 `n` 掉出几个包裹、`gone` 被冲走几个、`fy`
- `climb`：在水里点出指针后第二下点击（跳出水）。`ok`、`off`（指针离中间多远）、`zone`（绿区宽度）、`w`、`on`（会跳上的东西，null 是够不着）、`d`（离它边缘多远）、`wait`（指针出来几秒后才点）。第四轮之前是「扒住边后点一下」，还有 `climbEarly`，现在没了
- `swim_out`：出水，`sec`、`strokes`（蹬腿次数）、`fails`（没点中绿区、原地蹦的次数）、`to`（跳上了什么；yank 表示被车拽走）；10-22 起还有 `gauges`（这次落水跳出指针自动出现了几次）、`wheel`（落水后几秒第一次蹬腿，null 是一下没蹬）、`gear`（脚蹼的推力倍数，1 是没买）
- `rescue`：捞回包裹 `code`、`how`（tongue，第四轮起包裹进了舌头范围就自动卷回）、`after`（漂了几秒）、`late`（房子已经过去了）· `sunk`：包裹被冲出屏幕底部 `code`
- `pickup`：`code`、`size`、`urgent`、`cod`、`used`（背包占了几格）· `bag_full`：装不下还点 · `put_back`：放回车上
- `deliver`：`code`、`house`（房型 id，见 `src/game/cast.ts` HOUSE_DEFS，10-22 起）、`res`（这户居民的动物 id，RESIDENT_DEFS，10-22 起）、`ok`、`size`、`urgent`、`late`、`cod`、`sec`（取件到送达）；送错时还有 `want`（这家等的取件码）、`hadRight`（这家的包裹其实就在包里 → 是点错卡片，不是认错房子）
- `cod`：找零 `ok`、`pick`（选的）、`right`（正确的）、`price`、`paid`、`sec`（想了几秒）。10-29 起点完找零卡立刻关掉，结果在住户头上飘字，找错时底部提示应该找多少
- `missed`：房子过去了包裹没送 `code`、`inBag` · `urgent_late`：加急件超时 `code`
- `warn`：进了底部红线区 `state`、`on` · `thrown`：被甩出屏幕 `state`、`on`、`warnSec`
- `rush`：跑太靠前，车队加速 · `road`：落到路上 `spot`（ahead 在车前等车 / behind 在车尾）· `exhaust`：车尾起跳喷尾气
- `all_out`：全部送完开始 15 秒倒计时 · `yank`：被车拽回 `state`、`on`、`why`（call 送完 15 秒到点 / route 到站时不在车上）· `egg`：捡到遗失的信
- `hurry`：到站前 6 秒青蛙不在车上，司机开始催（`state`、`on`）· `route_end`：车开到终点（`state`、`on`，不在车上就会被拽回）
- `haul_land`（10-22 起）：被套索拽回、转圈飞上车撞晕落地的那一刻，`sec`（从 `yank` 到落车几秒）、`wet`（是不是从水里拽上来的）
- `driver_say`（10-22 起）：司机喊话，`kind`（hurry 快到站催上车 / call5 送完倒数剩 5 秒 / arrive 到站要拽了 / idle_warn 在车上发呆 7 秒催下车 / kick 10 秒踢下车）、`text`（喊的那句，台词表在 `src/game/lines.ts` 的 HURRY_LINES、KICK_LINES）
- `kicked`：在车上还有活却待着不动，被司机一脚踢到最近的荷叶，`d`（踢出去多远）；run_end 里的 `kicked` 是本局次数
- `dpr_cap`（10-22 起）：帧时间长期超 34ms，自动把画布清晰度上限降到 `cap`（game.ts）
- `hub_locked`（10-22 起）：新手点了还没开放的地方 `id`
- `jump` 多一个可选 `snap`（落点吸附了多少）；`yank` 的 `why` 多一种 `rope`（用了救命绳）
- `hint`：出现了哪条提示 `key`（每种每局最多记 3 条，总数在 run_end 的 `hints` 里）。10-29 起多一个 `pull`：3 秒内点了两下没拉，青蛙旁边演示「按住往下拉」（每局最多 2 次，第 1 天瞄准教学那一步不出）
- `pause`、`menu`：`id`（resume/restart/map/sound）

**章节机关（10-27 起，第 6 天以后；每天教一个，见 `src/game/config.ts` 的 DAYS 和 `levelfeats.ts`）**

- `jump` 多一个可选 `wind`：起跳时被阵风吹偏了多少（第 17 天起）
- `feat_hint`：第一次碰到某种机关时的说明 `f`（名字见 `config.ts` 的 `Feat`：bud 花苞荷叶 / turtle 乌龟 / fragile 易碎 / cold 冷藏 / owl 猫头鹰跟车 / rapids 急流 / dam 水坝 / return 退货 / slip 雨天石头 / rain 雨天 / whirl 漩涡 / storm 暴雨 / leaf 落叶 / gust 阵风 / night 夜路 / bulk 补货 / floe 浮冰 / thin 薄冰 / quiet 冬眠的熊 / warm 保温 / blizzard 暴风雪 / snow 下雪 / pier 栈桥 / ferry 渡船 / hook 吊钩 / gull 海鸥 / goose 大鹅 / nag 催单 / fireworks 烟花）
- `owl_say`：跟车的猫头鹰提醒一句 `text`
- `give_way`：脚下的东西不见了 `kind`（bud 花苞荷叶沉下去 / thin 薄冰裂开 / slip 在湿石头上滑倒 / gate 站在开闸的水坝闸门上）
- `ice`：薄冰被踩出裂缝、快要碎了 `hp`
- `whirl`：掉进漩涡被甩出来
- `knock`：易碎件跟着重重落地磕了一下 `code`、`n`（磕了几次，第 2 次碎）· `spoiled`：包裹坏了 `code`、`how`（broken 碎了 / melted 化了 / cold 凉了）。坏了照样能送，只扣评分
- `collect`：去居民家收退货 `code`、`size` · `return_in`：退货带回车上 `code`、`sec`
- `woke`：落地太重吵醒了冬眠的熊 `impact`
- `gull`：海鸥飞来 · `gull_miss`：海鸥扑空 `state`（青蛙在空中或在车上就抓不到）· `snatch`：海鸥叼走包里最上面的包裹 `code` · `shoo`：把海鸥赶走 `carrying`（它嘴里有没有包裹）、`code` · `snatch_lost`：包裹被海鸥叼出屏幕，算漏送 `code`
- `peck`：被看门的大鹅啄了 `house`
- `nag_late`：催单件送晚了 `code`
- `restock`：双十一补货，车上多了 `n` 件
- `story`：捡到乌龟爷爷的第 `n` 封信（第 1–30 天每天一封）· `old_letter`：第0号快递里把第一封信交给了阿灰
- `run_end`：一局结束的汇总。`how`：off（送完提前下班）/ done（车开到终点）/ thrown / restart / quit（暂停菜单回路线图）；
  `total`、`delivered`、`wrong`、`wet`、`missed`、`left`、`urgent`、`urgentOnTime`、`cod`、`codRight`、`falls`、`jumps`、`longest`、`closeCalls`、`bestTrip`，
  计数 `taps`、`tired`、`miss`、`far`（舌头够不着，或在水里点出指针时离哪儿都太远）、`climbOk`、`climbFail`、`strokes`、`swimSec`、`warn`、`warnSec`、`rush`、`pauses`、`putBack`、`bagFull`、`exhaust`、`rescued`、`sunk`、`idle`、`kicked`、`hints`、`misses`，
  `real`（实际秒数，含暂停）、`fps`、`slow`（卡顿帧数）、`state`/`on`/`step`（结束时青蛙在干什么）；
  10-27 起还有 `feats`：`spoiled`（坏了几件）、`careful`/`careOk`（要小心的件 / 完好送到的）、`returns`/`returned`（退货 / 收回的）、`woke`、`snatched`、`pecked`、`nagLate`、`nagTips`、`knocks`、`assist`
- `run_snap`：切到后台时的同样汇总（`how: hidden`）。一局没有 `run_end`，就看最后一条 `run_snap`，那多半是中途关掉了

## 埋点在代码哪里

所有事件都走同一个入口 `Telemetry.log(ev, d)`（`src/engine/telemetry.ts`）。各画面里的写法：

| 文件 | 调用方式 | 事件 |
|---|---|---|
| `src/game/game.ts` | `this.tm.log(...)` | open、loaded、dpr_cap、hide/show、error、sound、ach |
| `src/game/hub.ts`（主页小镇） | `game.tm.log(...)` | hub、hub_go、hub_locked、profile、rename |
| `src/game/map.ts`（路线图） | 同上 | map、map_go、map_back、map_locked |
| `src/game/play.ts`（一局） | `this.log(...)`，自动带 `day`、`t`、`d.p`（路线进度） | run_start、step、step_fix、jump、tap、tired、miss、idle、fall、climb、swim_out、rescue、sunk、pickup、bag_full、put_back、deliver、cod、missed、urgent_late、warn、thrown、rush、road、exhaust、all_out、hurry、route_end、yank、haul_land、driver_say、kicked、egg、hint、pause、menu、run_end、run_snap，章节机关的 feat_hint、owl_say、give_way、ice、whirl、knock、spoiled、collect、return_in、woke、gull、gull_miss、snatch、shoo、snatch_lost、peck、nag_late、restock、story、old_letter |
| `src/game/hq.ts`（下班结算） | `game.tm.log(...)` | hq、hq_btn、photo、photo_save、photo_keep |
| `src/game/ending.ts`（年终总结） | 同上 | ending、ending_page |
| `src/game/hall.ts`（总部大厅） | 同上 | hall、hall_tab、album_view、album_del |
| `src/game/home.ts`（我的家） | 同上 | home、home_open、photo_hang、wear、story_read、secret_start |
| `src/game/shop.ts`（福利社） | 同上 | shop、shop_tab、shop_buy |

在代码里找某个事件：`grep -n "log('事件名'" src/game/*.ts`。play.ts 里的计数器（`this.tally`）不单独发，汇总在 `run_end` / `run_snap`。

## 怎么加一个新埋点

1. 在触发的地方调用 `log`：一局里用 `this.log('名字', { 字段 })`，其他画面用 `this.game.tm.log('名字', { 字段 })`。
2. 规矩：
   - 事件名小写加下划线，≤32 字符；`d` 里只放数字、短字符串、布尔、小数组，整行 `d` 不超过 4000 字节（表上有约束，超了整批会被拒）。
   - **不收个人信息**：不记玩家输入的文字（改名只记 `len`），不记照片内容，不记精确位置、联系方式。
   - 高频的事（每帧、每次划水）不要单独发，放进 `this.tally` 计数，在 `summary()` 里加字段，随 `run_end` 一起发；或者像 `tap`、`hint` 那样每局限几条。
   - 数值四舍五入（`r1`、`r2`、`Math.round`），省空间也更好读。
3. 在本文档的「事件」里写上名字、字段和什么时候触发，标上加入日期。
4. 想在报告里看到它，就在 `scripts/stats.py` 的 `report()` 里加一行（`by_ev['名字']` 就是这个事件的所有行）。
5. 不用改数据库：所有事件都进同一张 `events` 表，详情放在 `d`（jsonb）里。

## 读数据（stats.py）

```bash
python3 scripts/stats.py                          # 全部数据的中文报告
python3 scripts/stats.py --since 2026-10-22       # 只看某天以后
python3 scripts/stats.py --build 1a2b3c4          # 只看某个版本（v 列的 commit 部分）
python3 scripts/stats.py --exclude <pid> <pid>    # 去掉某些玩家
python3 scripts/stats.py --dump rows.json         # 另外把原始行存下来，自己再分析
```

只用 Python 标准库，不用装东西。项目地址和 key 从 `src/engine/telemetry.ts` 顶部读，也可以用环境变量 `WAQU_TM_URL` / `WAQU_TM_KEY` 覆盖。
原始行也能直接用 REST 拉：`curl "$URL/rest/v1/events?select=*&order=at.asc&limit=1000&offset=0" -H "apikey: $KEY"`（每页最多 1000 行）。

## 不要把测试混进数据（?tm=off 规则）

- 自己或机器人在**线上站点**测试，网址一定加 `?tm=off`（例 `https://cxcboss.github.io/waqu-waqu/?tm=off&day=3`）。这台设备从此都不记，`?tm=on` 恢复。
- 本地开发服务器（localhost / 局域网 IP / file:）和 `/preview…/` 子路径默认不记；要在本地测埋点加 `?tm=on`，并且最好用 Playwright 拦截 `**/rest/v1/events**` 不让它真发出去（`/mnt/project-files/wa-qu/playtest/human4.cjs` 就是这样做的）。
- 万一测试行进了库：玩家 ID 以 `claude-` 开头的会被 stats.py 自动去掉；其他的用 `--exclude <pid>`。anon key 删不了行，要删只能在 Supabase 后台用 SQL。

## Supabase 设置（不含密钥）

- 项目：用户自己的 Supabase 免费项目（组织 waqu，东京区），地址 `https://oitbtkfwybkuqddqggsg.supabase.co`。
- 建表：在 Supabase 后台 SQL Editor 里整段运行 `scripts/telemetry.sql`（可重复运行）。表 `public.events`，开了 RLS，anon 角色只有 insert 和 select 两条策略，所以网页里的钥匙不能改、不能删数据。
- 网页用的是 **publishable key**（`sb_publishable_…`），它本来就要放在前端代码里，写在 `src/engine/telemetry.ts` 的 `KEY`。**secret key（`sb_secret_…`）和数据库密码绝不能写进代码、文档或提交记录。**
- 换一个项目：改 `telemetry.ts` 顶部的 `ENDPOINT` 和 `KEY`，在新项目跑一遍 `telemetry.sql`，重新部署。玩家设备上没发出去的事件（最多 3000 条）会在下次打开时补发到新地址。
- 小游戏版：只需在 `wx.ts` 里用 `wx.request` 实现 `postJson`（并把域名加进小程序后台的 request 合法域名），埋点代码不用动。
