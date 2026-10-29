# 音效和音乐

游戏里的所有声音都在 `public/audio/`：`manifest.json` 是清单，`sfx/`、`amb/`、`bgm/` 是单声道 mp3，`CREDITS.md` 是来源和许可证（第三方全是 CC0，其余是本项目用代码合成的）。播放器是 `src/engine/audio.ts`，哪个场景、哪一天放什么在 `src/game/sound.ts`。

## 播放器（src/engine/audio.ts）

- 混音：音效 → 音效总线；环境声 → 环境声总线；音乐 → 音乐总线 → 压低（插曲、落水）；音乐和环境声再一起过「水下低通」；最后全部进一个限幅器，叠在一起也不会爆音。
- 开关：音乐和音效分开（`game.setAudio({ music, sfx })`，存档里 `music`、`sfx`，旧存档的 `sound` 自动迁移）。环境声跟着音效开关走。
- 下载：只有 manifest 里标了 `preload` 的音效在启动时解码，其余第一次用到才下载；音乐和环境声只下当前场景要的，最多留两首解码好的音乐。
- 音乐：每首都记得上次放到哪，回到这个场景接着放；换场景时交叉淡入淡出；同一个文件的变体（`bgm_hq` → `bgm_hq_low`）原地变声，不重新开始。循环区间是 manifest 的 `loopAt`（文件前后各多 0.3 秒，接缝不咔哒）。
- 插曲（kind 为 `jingle` 的，或者用 `audio.stinger()` 播）：放的时候音乐压低到 35%，两个插曲连着来会排队。
- 同一个 id 在几十毫秒内重复播放会被跳过（`gap`），同一个 id 同时最多几份（`voices`），总共最多 28 个声音。
- 环境声：`audio.setAmbience([...])` 换一组循环，带 `spots` 的会自己随机插入单发声音（雨里打雷、港口海鸥）。
- 居民说话：`say(audio, 物种, 心情)` 用几个音节拼一句「动物语」，音高和语速按物种（sound.ts 的 VOICES）。
- 微信小游戏（`wx.createWebAudioContext`）。2026-10-29 真机试玩：1.0.0「声音时有时无」，1.0.1「破声、然后没声、闪退」，1.0.2 起改成下面这样，并把声音的状态写进实时日志（见 ARCHITECTURE.md「微信小游戏」）：
  - 混音尽量简单：没有限幅器（主音量改成 0.75）、没有低通（水下只压低音量，音乐的闷声变体不闷）、蓄力的合成哼声不放，同时最多 12 个声音。
  - 不用 AudioParam 自动化：微信文档里 AudioParam 只有 `value`，所有渐变都在 `update()` 里每帧手动做。浏览器里时间常数为 0 的渐变也直接赋值，不交给 `setTargetAtTime`。
  - 新建的 context 立刻 `resume()` 一次；每次回到前台、通话结束都 `resume()`；触摸时只在还没成功恢复过、或者 `state` 不是 running 时才 `resume()`，而且两次至少隔 3 秒。
  - 放声音不看 `state`（只要没 closed、游戏不在后台）。
  - 1.0.1 曾在 iOS 17.5+ 每次回前台关掉旧 context 新建（微信说明里那是「高性能模式」的做法），之后出现闪退，1.0.2 去掉了；关掉的 context 还被场景里的声音句柄碰到，微信文档说 close 之后不要再访问它。
  - 声音是分包 `audio/`，美术分包下完就开始下；manifest 读不到会每 5 秒再试，最多 6 次。
  - playbackRate 限制在 (0, 2]，manifest 用 `platform.loadJson` 读，不用 TextDecoder。

## 响度

在游戏里音量 1 时：界面 −24，普通音效 −18，奖励 −16，插曲 −15，警告 −17，角色 −19（瞬时响度最大值，LUFS）；环境声 −31～−35、音乐 −20（积分响度），音乐削了低频、提了一点中高频，手机外放也听得见。2026-10 实录主混音：音乐和环境声在 −26 LUFS 左右，音效峰值在 −17～−20，没有削波。

## 怎么重新生成

```
python3 -m venv venv && venv/bin/pip install numpy scipy      # 还要 ffmpeg（带 libmp3lame）
venv/bin/python tools/audio/synth.py   build/synth               # 合成音效
venv/bin/python tools/audio/ambience.py build/amb                # 合成环境声循环
python3 tools/audio/fetch_sources.py   build/dl                  # 下载 Kenney 音效包和 OpenGameArt 音乐原件
venv/bin/python tools/audio/build.py build/dl build/synth build/amb <旧版母带> public/audio
```

旧版母带是项目文件里的 `wa-qu/audio`（第一版打包的 mp3 和它的 manifest）：Freesound 的素材只在那里有。新加一个声音：在 synth.py 写一个函数（或者在 build.py 里指向下载的原件），在 build.py 的清单里 `sfx(...)` 加一行，重新打包，然后在代码里 `game.audio.play('新id')`，再把下面的表补上。音乐的循环点用 `tools/audio/loopfind.py <文件> <最短秒> <最长秒>` 找。`tools/audio/inspect_sounds.py` 可以检查一批文件的响度和手机外放损失。

## 每个声音在哪里

「待接」的是已经做好、还没接进游戏的。
### 界面

| id | 用途 | 在哪里播 |
|---|---|---|
| `ui_tap` | 普通按钮点击 | hall, home, hq, hub, play, shop |
| `ui_confirm` | 确认/领取成功/开始 | game, home, hub, map |
| `ui_back` | 返回/取消 | hall, home, map, shop |
| `ui_open` | 打开浮层（背包、订单、弹窗） | home, hub, play, shop, viewer |
| `ui_close` | 关闭浮层 | hall, home, hq, hub, play, shop |
| `ui_error` | 操作无效（背包满了还领、钱不够、没解锁） | hub, map, play, shop |
| `ui_tick` | 结算数字滚动/逐条计数/蓄力刻度 | hq, play |
| `tab_switch` | 切换页签 | hall, home, shop |
| `toast_blip` | 小字条提示冒出来 | play |
| `hint_pop` | 提示气泡冒出来（猫头鹰提醒、教程） | play |
| `frame_tap` | 点相框/挂照片 | home |

### 音效

| id | 用途 | 在哪里播 |
|---|---|---|
| `map_unlock` | 路线图上解锁新的一天/新的一章 | map.ts：上次看地图以后开放了新的一站，进地图 0.5 秒时响一次（存档 `seen.map` 记已经看过的最远一站），那一站同时冒金圈、出提示 |
| `jump_charge_max` | 蓄力满 | play |
| `aim_predict` | 瞄准约 2 秒后出现预测虚线 | play |
| `jump_release` | 松手起跳（弹弓 '嗖-boing'） | hub, map, play |
| `jump_whoosh` | 空中风声（远跳时叠加） | play |
| `land_truck` | 落在运输车上（金属轻响 + 回弹 '啵'） | play |
| `land_pad` | 落在荷叶/浮木上（软软的啪嗒 + 水声） | map, play |
| `land_house` | 落在居民房子上（木头） | play |
| `tongue_thwip` | 吐舌头 | play, sound |
| `slurp` | 舌头卷着包裹缩回来 | play, sound |
| `perfect_sparkle` | 完美落点（落在荷叶正中、救回包裹） | play, sound |
| `fall_whistle` | 跳空下坠的卡通滑哨（入水前） | play |
| `splash` | 掉进河里 | play, sprites |
| `swim_stroke` | 游泳时每次点击划水 | play |
| `swim_stroke_2` | 划水变体 | swim_stroke 的变体 |
| `swim_bubbles` | 落水期间的咕噜水泡（循环） | play |
| `swim_climb` | 游上岸 | play |
| `truck_slowdown` | 青蛙回到车上，车减速 | play |
| `truck_speedup` | 再次起跳，车恢复速度 | play |
| `truck_horn` | 出发/到站/司机催（卡通喇叭） | hub, play |
| `truck_engine_loop` | 运输车发动机底噪（循环，音量很低） | play |
| `exhaust_puff` | 排气管冒烟呛到青蛙 | play, sound |
| `parcel_pickup` | 从车上领包裹（纸箱 + 拍一下） | play |
| `parcel_place` | 把包裹交给居民/放回车上 | play |
| `bag_open` | 打开背包/穿衣服 | play |
| `deliver_happy` | 居民开心签收 | play |
| `coin` | 得到金币/小费 | config, hq, icons, map, medal, menu, play, shop, sprites, widgets |
| `cash_register` | 货到付款收款 | play |
| `coins_change` | 找零数硬币 | play |
| `phone_ring` | 居民打电话催单 | sound |
| `lasso_whirl` | 司机甩套索 | play, sound |
| `rope_snap` | 套索绷紧把青蛙拉回来 | play, sound |
| `door_open` | 居民开门 | sound |
| `door_close` | 居民关门 | sound |
| `paper_flip` | 翻单据/翻页 | hall, home, hq, viewer |
| `paper_flip_2` | 翻页变体 | paper_flip 的变体；ending 翻页时和 paper_flip 交替 |
| `stamp` | 盖章（砰 + 墨印 '咔'） | career, hq, icons |
| `photo_shutter` | 照片定格 | hq, viewer |
| `purchase` | 福利社买东西 | shop |
| `equip` | 换上衣服/帽子 | home, shop |
| `gift_open` | 拆礼物/领奖励 | shop.ts：买下东西后礼物盒落到青蛙手里时；待接：结局礼物 |
| `letter_open` | 拆信 | play（捡到乌龟爷爷的信、第0号快递交信）、home（信箱里读信） |
| `gust` | 一阵风 | 环境声随机插入（amb_wind、amb_winter、amb_blizzard）；play 第 17 天起阵风吹来时、weather |
| `thunder` | 远处的雷 | 环境声随机插入（amb_rain、amb_storm）；weather 暴雨打闪 |
| `gull` | 海鸥叫 | 环境声随机插入（amb_harbor、amb_newyear）；play 海鸥飞来抢包裹 |
| `firecracker` | 鞭炮 | 环境声随机插入（amb_newyear）；weather 第 30 天烟花、ending 年终总结每朵烟花炸开 |
| `ice_crack` | 冰面裂开 | 环境声随机插入（amb_winter、amb_blizzard）；play 踩上薄冰 |
| `leaf_rustle` | 落叶沙沙 | 环境声随机插入（amb_wind）；play 落叶被踩沉、weather 飘叶 |

### 警告

| id | 用途 | 在哪里播 |
|---|---|---|
| `parcel_soaked` | 背包里的包裹泡水了 | play |
| `bag_full` | 背包满了/太重 | play |
| `coin_loss` | 扣钱（救命绳、罚款） | play |
| `urgent_alert` | 新的加急件/加急快超时 | play |
| `urgent_tick` | 加急倒计时的一声嘀嗒（play.ts 越来越快地播） | play |
| `urgent_late` | 加急超时 | play |
| `warn_pulse` | 危险提示（快被甩出屏幕、要沉了） | play, sound |

### 角色说话

| id | 用途 | 在哪里播 |
|---|---|---|
| `frog_croak` | 青蛙叫：起跳/成功落地/点主页的青蛙 | home, hub, play |
| `frog_croak_2` | 青蛙叫（短促变体） | frog_croak 的变体 |
| `deliver_confused` | 居民疑惑（送错了） | play |
| `deliver_unhappy` | 居民不满（加急迟到、找零错） | play |
| `aww_missed` | 包裹没送到，房子过去了 | play, sound |
| `warn_pop` | 青蛙 '哇哦！'（刚进危险区） | play, sound |
| `owl_hoot` | 猫头鹰经理出场 | hall, hq；play 跟车的猫头鹰提醒 |
| `owl_hoot_2` | 猫头鹰叫（变体） | owl_hoot 的变体 |
| `owl_hoot_3` | 猫头鹰叫（变体） | owl_hoot 的变体 |
| `owl_pleased` | 猫头鹰 '嗯嗯'（满意） | hq |
| `owl_hmm` | 猫头鹰 '嗯……'（不太满意） | hq |
| `driver_call` | 司机喊一声 | play, sound |
| `driver_cheer` | 司机高兴 | play, sound |
| `driver_grumble` | 司机嘟囔 | play, sound |
| `hamster_hi` | 仓鼠问好 | shop |
| `hamster_thanks` | 仓鼠谢谢 | shop |
| `hamster_hmm` | 仓鼠发愁 | shop |
| `syl_soft_1…5`、`syl_beak_1…4`、`syl_bleat_1…3`、`syl_click_1…3` | 居民说话的音节 | sound.ts 的 `say()`：按物种（VOICES 表）选音节、音高和语速 |

### 插曲（压低音乐，排队不重叠）

| id | 用途 | 在哪里播 |
|---|---|---|
| `day_start` | 开工小乐句 | play, sound |
| `day_complete` | 完成当天路线（胜利小乐句，和白天音乐同一作者） | play, sound |
| `day_fail` | 当天提前结束（卡通失败长号） | play, sound |
| `chapter_clear` | 一章全部通过 | hq.ts `playStamp`：第一次通过一章的最后一天，盖章 0.9 秒后响，同时提示「第 N 章完成！新河段开放了」 |
| `rating_good` | 评级揭晓（好） | hq |
| `rating_bad` | 评级揭晓（差） | hq |
| `achievement` | 成就达成 | game |
| `rank_up` | 升职 | game |
| `upgrade` | 装备升级 | shop |

### 环境声

| id | 用途 | 在哪里播 |
|---|---|---|
| `amb_river` | 河水（每天全程） | sound |
| `amb_frogs` | 远处蛙鸣（夏天、主页夜里） | sound |
| `amb_birds` | 春天的鸟叫（第 1 章、主页白天） | sound |
| `amb_cicadas` | 夏天的蝉和蜻蜓（第 2 章） | sound |
| `amb_rain` | 雨（第 3 章；暴雨夜带雷） | sound |
| `amb_wind` | 秋风和落叶（第 4 章） | sound |
| `amb_winter` | 冬天的冷风和冰（第 5 章） | sound |
| `amb_harbor` | 港口的海浪和海鸥（第 6 章） | sound |
| `amb_crickets` | 夜里的蟋蟀（夜路、主页夜里） | sound |
| `amb_storm` | 暴雨（第 15 天）：雨更大、雷更密 | sound |
| `amb_blizzard` | 暴风雪（第 25 天）：风更急 | sound |
| `amb_newyear` | 年末烟花夜（第 30 天）：远处的鞭炮 | sound |

### 音乐

| id | 用途 | 在哪里播 |
|---|---|---|
| `bgm_title` | 主页、路线图 | sound |
| `bgm_work` | 第 1 章 春 · 柳湾 | sound |
| `bgm_summer` | 第 2 章 初夏 · 荷花塘 | sound |
| `bgm_rain` | 第 3 章 雨季 · 急流峡 | sound |
| `bgm_autumn` | 第 4 章 秋 · 枫叶溪 | sound |
| `bgm_winter` | 第 5 章 冬 · 冰河 | sound |
| `bgm_harbor` | 第 6 章 年末 · 港口集市 | sound |
| `bgm_spring` | 第 7 章 早春 · 环河联运 | sound |
| `bgm_hq` | 总部、大厅 | sound |
| `bgm_shop` | 福利社 | sound |
| `bgm_home` | 小呱的家 | sound |
| `bgm_hq_low` | 没过关时的总部：同一首，更轻更闷 | sound |
| `bgm_storm` | 暴雨夜班（第 15 天）：闷一点、慢一点 | sound |
| `bgm_blizzard` | 暴风雪（第 25 天）：闷一点、慢一点 | sound |
| `bgm_ending` | 第 30 天之后的结局：主题曲从头再来 | sound |
