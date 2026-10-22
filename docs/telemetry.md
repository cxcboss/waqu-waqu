# 试玩数据（匿名游玩统计）

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

- `open`：`os`、`browser`（wechat/qq/safari/chrome…）、`w`/`h`（CSS 像素）、`dpr`、`touch`、`standalone`、`visit`（这台设备第几次打开）、`unlocked`（已解锁到第几天）、`coins`、`sound`、`stamps`（好评章总数）、`jump`（用 `?day=` 直接进的）
- `loaded`：`ms` 加载耗时
- `hide` / `show`：切到后台 / 回来，`scene`（loading/hub/map/play/hq/hall/home/shop；10-22 前的版本还有 title）。`hide` 之后没有 `show` 通常就是关掉了
- `error`：`msg`、`where`（文件:行:列 + 调用栈前几行，压缩后的代码，对照同版本 `vite build --sourcemap` 查）、`scene`
- `sound`：`on`、`scene`

**主页（10-22 起，代替原来的标题页）**

- `hub`：进主页 `unlocked`、`coins`、`notes`（没读的河湾动态条数）· `hub_go`：`to`（hq 总部 / shop 福利社 / home 我的家 / work 上班 / map 路线图）
- `profile`：打开工牌 · `rename`：改名 `len`（几个字）
- `ach`：达成成就 `id`、`scene`（在哪个画面达成的）

**路线图、结算**

- `map`：`sel`、`unlocked` · `map_go` / `map_back`：`sel`、`sec`（在路线图待了几秒）· `map_locked`：点了没解锁的 `day`
- `hq`：`grade`、`pass`、`stamps`（三枚章）、`fresh`（本局新拿的）、`income`（含升职加薪和新章奖励）、`coins`、`photos`、`rankUp`（升到的职级，没升是 null）、`ach`（这一局达成的成就 id）、`news`（新增的河湾动态条数）
- `hq_btn`：`id`（retry/home/next）、`open`（下一天是否已解锁）、`sec`（结算页看了几秒）
- `photo`：看大图 `i`、`kind` · `photo_save`：`res`（shared/downloaded/longpress/cancelled/failed）
- `photo_keep`：点照片上的 ♥ `i`、`kind`、`on`（true 收进相册 / false 取消）、`n`（相册现在几张）

**总部大厅、我的家、福利社**

- `hall`：进总部 `tab`、`notes` · `hall_tab`：`tab`（送单/日志/相册/荣誉/动态）· `album_view`：看相册大图 `i`、`n` · `album_del`：移出相册后剩 `n` 张
- `home`：进家 `frames`（墙上挂了几张）、`decos`（有几件家具）· `home_open`：`what`（hang 挂照片 / wardrobe 衣柜 / records 个人记录 / letters 信箱 / decor 布置）
- `photo_hang`：挂上照片 `slot`、`frame`（相框）、`hung`（一共挂了几张）· `wear`：换装 `slot`（hat/neck）、`id`（null 是不戴）
- `shop`：进福利社 `tab`、`coins` · `shop_tab`：`tab` · `shop_buy`：`what`（装备是 `bag3` 这样的「装备+升到的级」，其余是物品 id）、`price`、`coins`（买完剩多少）

**一局**

- `run_start`：`attempt`（这台设备第几次玩这一天）、`unlocked`、`best`、`stamps`
- `step`：新手步骤切换 `from` → `to`、`sec`（上一步停留秒数）。`from: intro` 的 `sec` 就是开工说明卡看了多久；第 1 天依次 pick（点包裹）→ aim（拉）→ go（跳去房子）→ deliver（点卡片交件）→ refill（回车）；`rescue` 是第一次落水的教学（第四轮起教方向轮盘，碰一下轮盘才继续）
- `jump`（落地时记一条）：`pow` 力度 0～1、`dx`/`dy` 手指拉的方向（青蛙往反方向跳；`dy<0` 是手指往上拉、青蛙往下跳）、`held` 按了几秒、`from` 起跳处、`w` 背包重量、`fy` 起跳时在屏幕的高度（0 顶 1 底）、`smog` 在尾气里、`step`、`dist`、`on` 落点（lily/log/house/truck/bank/water）；落水时还有 `near`（离最近落脚点的距离）、`to`（那是什么）、`short`（true 跳近了 / false 跳远了）；第 1 天引导那一跳有 `target`（是否跳中了引导的荷叶）
- `tap`：按了一下没拉开（想跳却只是点），`len`、`held`、`under`（手指下面是什么）、`on`、`step`（每局最多记 20 条）
- `tired`：按住超过 3 秒脚累了，`step`、`on`
- `miss`：在等别的操作时点了没用的地方，`where`：intro（说明卡上没点按钮）/ pick / deliver（引导要点卡片时）/ rescue（落水教学时没碰轮盘）/ cod（找零时没点到选项）（每种每局最多 5 条）
- `idle`：隔了 ≥8 秒才再点屏幕，`sec`、`step`、`state`、`on`（站在车上等房子是正常的）
- `fall`：落水 `n` 掉出几个包裹、`gone` 被冲走几个、`fy`
- `climb`：在水里点出指针后第二下点击（跳出水）。`ok`、`off`（指针离中间多远）、`zone`（绿区宽度）、`w`、`on`（会跳上的东西，null 是够不着）、`d`（离它边缘多远）、`wait`（指针出来几秒后才点）。第四轮之前是「扒住边后点一下」，还有 `climbEarly`，现在没了
- `swim_out`：出水，`sec`、`strokes`（蹬腿次数）、`fails`（没点中绿区、原地蹦的次数）、`to`（跳上了什么；yank 表示被车拽走）
- `rescue`：捞回包裹 `code`、`how`（tongue，第四轮起包裹进了舌头范围就自动卷回）、`after`（漂了几秒）、`late`（房子已经过去了）· `sunk`：包裹被冲出屏幕底部 `code`
- `pickup`：`code`、`size`、`urgent`、`cod`、`used`（背包占了几格）· `bag_full`：装不下还点 · `put_back`：放回车上
- `deliver`：`code`、`ok`、`size`、`urgent`、`late`、`cod`、`sec`（取件到送达）；送错时还有 `want`（这家等的取件码）、`hadRight`（这家的包裹其实就在包里 → 是点错卡片，不是认错房子）
- `cod`：找零 `ok`、`pick`（选的）、`right`（正确的）、`price`、`paid`、`sec`（想了几秒）
- `missed`：房子过去了包裹没送 `code`、`inBag` · `urgent_late`：加急件超时 `code`
- `warn`：进了底部红线区 `state`、`on` · `thrown`：被甩出屏幕 `state`、`on`、`warnSec`
- `rush`：跑太靠前，车队加速 · `road`：落到路上 `spot`（ahead 在车前等车 / behind 在车尾）· `exhaust`：车尾起跳喷尾气
- `all_out`：全部送完开始 15 秒倒计时 · `yank`：时间到被拽回车 · `egg`：捡到遗失的信
- `hint`：出现了哪条提示 `key`（每种每局最多记 3 条，总数在 run_end 的 `hints` 里）
- `pause`、`menu`：`id`（resume/restart/map/sound）
- `run_end`：一局结束的汇总。`how`：off（送完提前下班）/ done（车开到终点）/ thrown / restart / quit（暂停菜单回路线图）；
  `total`、`delivered`、`wrong`、`wet`、`missed`、`left`、`urgent`、`urgentOnTime`、`cod`、`codRight`、`falls`、`jumps`、`longest`、`closeCalls`、`bestTrip`，
  计数 `taps`、`tired`、`miss`、`far`（舌头够不着，或在水里点出指针时离哪儿都太远）、`climbOk`、`climbFail`、`strokes`、`swimSec`、`warn`、`warnSec`、`rush`、`pauses`、`putBack`、`bagFull`、`exhaust`、`rescued`、`sunk`、`idle`、`hints`、`misses`，
  `real`（实际秒数，含暂停）、`fps`、`slow`（卡顿帧数）、`state`/`on`/`step`（结束时青蛙在干什么）
- `run_snap`：切到后台时的同样汇总（`how: hidden`）。一局没有 `run_end`，就看最后一条 `run_snap`，那多半是中途关掉了
