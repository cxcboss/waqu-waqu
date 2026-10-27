# 蛙趣蛙趣 音频打包：把下载的原件、旧版母带、合成的音效和环境声统一处理成游戏用的单声道 mp3，
# 写出 public/audio/manifest.json 和 CREDITS.md。说明见 docs/audio.md。
#
# 用法:
#   python3 synth.py <合成目录>                 # 先生成合成音效
#   python3 ambience.py <环境声目录>            # 再生成环境声循环
#   python3 fetch_sources.py <下载目录>         # Kenney 音效包、OpenGameArt 音乐原件
#   python3 build.py <下载目录> <合成目录> <环境声目录> <旧版母带目录> <输出目录 public/audio>
#
# 旧版母带 = 项目文件 wa-qu/audio（第一版打包的 mp3 和它的 manifest.json）：Freesound 的素材只在那里有。
#
# 响度（都是游戏里音量 1 时）：
# - 音效按「瞬时响度最大值」(400 ms, LUFS) 对齐：界面 −24，普通 −18，奖励 −16，插曲 −15，警告 −17，角色 −19。
# - 环境声和音乐按积分响度：环境声 −31～−35，音乐 −20（先削低频、提一点中高频，手机外放也听得见）。
# - 全部先过 70 Hz 高通，峰值压在 −1 dBFS 以下（前瞻限幅，不削波）。
# - 手机外放模拟（lib.phone）比全频小 6 dB 以上的会打印警告。
import sys, os, json, shutil
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import SR, load, encode, eq, hp, momentary, integrated, phone, limit, fade, trim, loop_xfade, db  # noqa: E402

DL, SYN, AMB, OLD, OUT = sys.argv[1:6]
OLD_MANIFEST = json.load(open(os.path.join(OLD, "manifest.json")))["sounds"]

KENNEY_PACK = {
    "interface-sounds": "Interface Sounds", "rpg-audio": "RPG Audio", "impact-sounds": "Impact Sounds",
    "casino-audio": "Casino Audio", "ui-audio": "UI Audio", "music-jingles": "Music Jingles",
}
OGA = {  # OpenGameArt 曲目：slug -> (曲名, 作者)
    "gone-fishin": ("Gone Fishin' / Beary Fishy Menu Screen / The Reel Winner", "Memoraphile @ You're Perfect Studio"),
    "cozy-puzzle-in-game-3": ("Cozy Puzzle In-Game 3", "mintodog"),
    "childrens-march-theme": ("Children's March Theme", "Cleyton Kauffman"),
    "down-the-river": ("Down the River", "Komiku (Loyalty Freak Music)"),
    "happy-vibes": ("Happy Vibes", "Ruskerdax"),
    "4-music-box-tracks": ("4 Music Box Tracks", "AureolusOmicron"),
    "jazz-aug-15-ionion": ("Jazz Aug 15 <> Ionion", "pro-sensory"),
    "good-morning": ("Good Morning", "Cakeflaps @ You're Perfect Studio"),
    "happy-ukelele-island-surfing-theme": ("Happy Ukelele Island Surfing Theme", "Tarush Singhal"),
}
OWN = dict(source="代码合成 · tools/audio", author="本项目原创", url="", license="原创，无限制")


def resolve(src):
    """来源写法 → (文件路径, 署名)。K: Kenney 包, O: OpenGameArt, S: synth.py, A: ambience.py, L: 旧版母带。"""
    kind, ref = src.split(":", 1)
    if kind == "K":
        pack, f = ref.split("/", 1)
        return os.path.join(DL, "kenney", pack, "Audio", f), [dict(
            source="Kenney · " + KENNEY_PACK[pack], author="Kenney (kenney.nl)",
            url=f"https://kenney.nl/assets/{pack}", license="CC0 1.0")]
    if kind == "O":
        slug, f = ref.split("/", 1)
        title, author = OGA[slug]
        return os.path.join(DL, "oga", slug, f), [dict(
            source="OpenGameArt · " + title, author=author, url=f"https://opengameart.org/content/{slug}",
            license="CC0 1.0")]
    if kind == "S":
        return os.path.join(SYN, ref + ".wav"), [OWN]
    if kind == "A":
        return os.path.join(AMB, ref + ".wav"), [OWN]
    if kind == "L":
        old = OLD_MANIFEST[ref]
        # 旧版里由原创合成的部分不再记“旧版”，统一记原创
        return os.path.join(OLD, old["file"]), [
            OWN if c.get("license", "").startswith("原创") else {k: v for k, v in c.items() if k != "file"}
            for c in old["credits"]]
    raise ValueError(src)


# ---------------------------------------------------------------- 清单

E = []
# 每类的默认响度目标（瞬时最大值）
TARGET = {"ui": -24, "sfx": -18, "voice": -19, "warn": -17, "jingle": -15}


def sfx(id, kind, use, layers, target=None, *, alt=None, preload=False, gap=None, voices=None, fo=0.02,
        loop=False, vol=1.0, bands=None):
    """一个音效。layers: [(来源, 起始偏移秒, 增益dB[, 裁剪起, 裁剪止])]。"""
    E.append(dict(id=id, kind=kind, use=use, layers=layers, target=TARGET[kind] if target is None else target,
                  alt=alt, preload=preload, gap=gap, voices=voices, fo=fo, loop=loop, vol=vol, bands=bands))


def bed(id, use, src, target, *, vol=1.0, spots=None, kbps=40):
    """一条环境声循环（文件本身首尾无缝）。"""
    E.append(dict(id=id, kind="amb", use=use, src=src, target=target, vol=vol, spots=spots, kbps=kbps))


def music(id, use, src, *, loop=None, start=None, vol=0.8, target=-20.0, xfade=0.04, bass=-5):
    """
    一首背景音乐。loop=(起点秒, 长度秒)：用 loopfind.py 量出来的无缝区间；不给就整首循环（原作者做成可循环的）。
    start：第一次播放从循环里的哪一秒开始（跳过安静的前奏）。bass：220 Hz 以下削多少 dB（低音重的曲子多削一点）。
    """
    E.append(dict(id=id, kind="music", use=use, src=src, loop=loop, start=start, vol=vol, target=target,
                  xfade=xfade, bass=bass))


def variant(id, of, kind, use, *, vol=1.0, rate=None, lowpass=None, spots=None):
    """不另占下载的变体：用另一条的文件，换音量、速度、低通或随机插入的单发声音。"""
    E.append(dict(id=id, kind=kind, of=of, use=use, vol=vol, rate=rate, lowpass=lowpass, spots=spots))


L = lambda name: ("L:" + name, 0, 0)  # noqa: E731
S = lambda name, off=0, g=0: ("S:" + name, off, g)  # noqa: E731
K = lambda ref, off=0, g=0: ("K:" + ref, off, g)  # noqa: E731

# 界面
sfx("ui_tap", "ui", "普通按钮点击", [K("interface-sounds/select_001.ogg")], preload=True)
sfx("ui_confirm", "ui", "确认/领取成功/开始", [K("interface-sounds/confirmation_001.ogg")], -22, preload=True)
sfx("ui_back", "ui", "返回/取消", [K("interface-sounds/back_001.ogg")], preload=True)
sfx("ui_open", "ui", "打开浮层（背包、订单、弹窗）", [K("interface-sounds/open_001.ogg")], preload=True)
sfx("ui_close", "ui", "关闭浮层", [K("interface-sounds/close_001.ogg")], preload=True)
sfx("ui_error", "ui", "操作无效（背包满了还领、钱不够、没解锁）", [K("interface-sounds/error_001.ogg")], -22, preload=True)
sfx("ui_tick", "ui", "结算数字滚动/逐条计数/蓄力刻度", [K("interface-sounds/tick_001.ogg")], -27, preload=True, gap=0.03)
sfx("tab_switch", "ui", "切换页签", [S("tab_switch")], preload=True)
sfx("toast_blip", "ui", "小字条提示冒出来", [S("toast_blip")], preload=True, gap=0.15)
sfx("hint_pop", "ui", "提示气泡冒出来（猫头鹰提醒、教程）", [S("hint_pop")], -22, preload=True, gap=0.2)
sfx("frame_tap", "ui", "点相框/挂照片", [S("frame_tap")], -22)
sfx("map_unlock", "sfx", "路线图上解锁新的一天/新的一章", [S("map_unlock")], -17)

# 跳跃
sfx("jump_charge_max", "sfx", "蓄力满", [S("jump_charge_max")], -21, preload=True)
sfx("aim_predict", "sfx", "瞄准约 2 秒后出现预测虚线", [S("aim_predict")], -23, preload=True)
sfx("jump_release", "sfx", "松手起跳（弹弓 '嗖-boing'）", [S("jump_release")], preload=True, voices=3)
sfx("jump_whoosh", "sfx", "空中风声（远跳时叠加）", [S("jump_whoosh")], -23, preload=True)
sfx("frog_croak", "voice", "青蛙叫：起跳/成功落地/点主页的青蛙", [L("frog_croak")], alt=["frog_croak_2"], preload=True, gap=0.2)
sfx("frog_croak_2", "voice", "青蛙叫（短促变体）", [L("frog_croak_2")], preload=True)
sfx("land_truck", "sfx", "落在运输车上（金属轻响 + 回弹 '啵'）",
    [K("impact-sounds/impactMetal_light_000.ogg"), S("land_bloop", 0.005, -5)], preload=True)
sfx("land_pad", "sfx", "落在荷叶/浮木上（软软的啪嗒 + 水声）", [L("land_pad")], preload=True)
sfx("land_house", "sfx", "落在居民房子上（木头）",
    [K("impact-sounds/impactWood_light_000.ogg"), S("land_bloop", 0.005, -6)], preload=True)
sfx("tongue_thwip", "sfx", "吐舌头", [S("tongue_thwip")], -19, preload=True)
sfx("slurp", "sfx", "舌头卷着包裹缩回来", [S("slurp")], -19, preload=True)
sfx("perfect_sparkle", "sfx", "完美落点（落在荷叶正中、救回包裹）", [S("perfect_sparkle")], -18, preload=True)

# 落水 / 游泳
sfx("fall_whistle", "sfx", "跳空下坠的卡通滑哨（入水前）", [S("fall_whistle")], -21, preload=True)
sfx("splash", "sfx", "掉进河里", [L("splash")], -16, preload=True)
sfx("swim_stroke", "sfx", "游泳时每次点击划水", [L("swim_stroke")], -20, alt=["swim_stroke_2"], preload=True)
sfx("swim_stroke_2", "sfx", "划水变体", [L("swim_stroke_2")], -20, preload=True)
sfx("swim_bubbles", "sfx", "落水期间的咕噜水泡（循环）", [S("swim_bubbles")], -27, loop=True, preload=True)
sfx("swim_climb", "sfx", "游上岸", [S("swim_climb")], preload=True)
sfx("parcel_soaked", "warn", "背包里的包裹泡水了", [L("parcel_soaked")], -19, preload=True)

# 车
sfx("truck_slowdown", "sfx", "青蛙回到车上，车减速", [S("truck_slowdown")], -21, preload=True)
sfx("truck_speedup", "sfx", "再次起跳，车恢复速度", [S("truck_speedup")], -21, preload=True)
sfx("truck_horn", "sfx", "出发/到站/司机催（卡通喇叭）", [L("truck_horn")], preload=True, gap=0.25)
sfx("truck_engine_loop", "sfx", "运输车发动机底噪（循环，音量很低）", [L("truck_engine_loop")], -29, loop=True, vol=0.6,
    preload=True)
sfx("exhaust_puff", "sfx", "排气管冒烟呛到青蛙", [S("exhaust_puff")], -19)

# 包裹 / 居民
sfx("parcel_pickup", "sfx", "从车上领包裹（纸箱 + 拍一下）", [L("parcel_pickup"), S("pickup_pop", 0.0, -3)], -19, preload=True)
sfx("parcel_place", "sfx", "把包裹交给居民/放回车上", [K("rpg-audio/bookPlace1.ogg")], -20, preload=True)
sfx("bag_open", "sfx", "打开背包/穿衣服", [K("rpg-audio/cloth1.ogg")], -22, preload=True)
sfx("bag_full", "warn", "背包满了/太重", [S("bag_full")], -19, preload=True)
sfx("deliver_happy", "sfx", "居民开心签收", [S("deliver_happy")], -17, preload=True)
sfx("deliver_confused", "voice", "居民疑惑（送错了）", [S("deliver_confused")], -18, preload=True)
sfx("deliver_unhappy", "voice", "居民不满（加急迟到、找零错）", [S("deliver_unhappy")], -18, preload=True)
sfx("aww_missed", "voice", "包裹没送到，房子过去了", [S("aww_missed")], preload=True)
sfx("coin", "sfx", "得到金币/小费", [S("coin")], -18, preload=True, gap=0.06)
sfx("coin_loss", "warn", "扣钱（救命绳、罚款）", [S("coin_loss")], -19, preload=True)
sfx("cash_register", "sfx", "货到付款收款", [S("cash_register")], -18, preload=True)
sfx("coins_change", "sfx", "找零数硬币", [K("rpg-audio/handleCoins.ogg")], -21, preload=True)
sfx("urgent_alert", "warn", "新的加急件/加急快超时", [S("urgent_alert")], preload=True)
sfx("urgent_tick", "warn", "加急倒计时的一声嘀嗒（play.ts 越来越快地播）", [S("urgent_tick")], -22, preload=True, gap=0.05)
sfx("urgent_late", "warn", "加急超时", [S("urgent_late")], -18, preload=True)
sfx("phone_ring", "sfx", "居民打电话催单", [L("phone_ring")], -20)
sfx("warn_pulse", "warn", "危险提示（快被甩出屏幕、要沉了）", [S("warn_pulse")], -19, preload=True, gap=0.3)
sfx("warn_pop", "voice", "青蛙 '哇哦！'（刚进危险区）", [S("warn_pop")], preload=True, gap=0.5)
sfx("lasso_whirl", "sfx", "司机甩套索", [S("lasso_whirl")], -20)
sfx("rope_snap", "sfx", "套索绷紧把青蛙拉回来", [S("rope_snap")], -18)
sfx("door_open", "sfx", "居民开门", [K("rpg-audio/doorOpen_1.ogg")], -22, gap=0.2)
sfx("door_close", "sfx", "居民关门", [K("rpg-audio/doorClose_1.ogg")], -23, gap=0.2)

# 一天的开始和结束 / 总部
sfx("day_start", "jingle", "开工小乐句", [S("day_start")], -17)
sfx("day_complete", "jingle", "完成当天路线（胜利小乐句，和白天音乐同一作者）",
    [("O:gone-fishin/the_reel_winner.mp3", 0, 0)], -16, fo=0.3, bands=[("lowshelf", 220, -5, 0.7), ("peak", 2800, 2, 0.8)])
sfx("day_fail", "jingle", "当天提前结束（卡通失败长号）", [S("day_fail")], -17)
sfx("chapter_clear", "jingle", "一章全部通过", [S("chapter_clear")], -15)
sfx("owl_hoot", "voice", "猫头鹰经理出场", [L("owl_hoot")], -20, alt=["owl_hoot_2", "owl_hoot_3"], gap=0.4)
sfx("owl_hoot_2", "voice", "猫头鹰叫（变体）", [S("owl_hoot_2")], -20)
sfx("owl_hoot_3", "voice", "猫头鹰叫（变体）", [S("owl_hoot_3")], -20)
sfx("owl_pleased", "voice", "猫头鹰 '嗯嗯'（满意）", [S("owl_pleased")], -20)
sfx("owl_hmm", "voice", "猫头鹰 '嗯……'（不太满意）", [S("owl_hmm")], -20)
sfx("paper_flip", "sfx", "翻单据/翻页", [K("rpg-audio/bookFlip1.ogg")], -22, alt=["paper_flip_2"])
sfx("paper_flip_2", "sfx", "翻页变体", [K("rpg-audio/bookFlip2.ogg")], -22)
sfx("stamp", "sfx", "盖章（砰 + 墨印 '咔'）", [L("stamp"), S("stamp_chk", 0.0, 0)], -16)
sfx("photo_shutter", "sfx", "照片定格", [L("photo_shutter")], -20)
sfx("rating_good", "jingle", "评级揭晓（好）", [S("rating_good")], -16)
sfx("rating_bad", "jingle", "评级揭晓（差）", [S("rating_bad")], -17)
sfx("achievement", "jingle", "成就达成", [S("achievement")], -16)
sfx("rank_up", "jingle", "升职", [S("rank_up")], -15)
sfx("upgrade", "jingle", "装备升级", [S("upgrade")], -17)
sfx("purchase", "sfx", "福利社买东西", [S("purchase")], -18)
sfx("equip", "sfx", "换上衣服/帽子", [S("equip")], -20)
sfx("gift_open", "sfx", "拆礼物/领奖励", [S("gift_open")], -18)
sfx("letter_open", "sfx", "拆信", [S("letter_open")], -20)

# 天气的单发声音（环境声循环播放时随机插进去，也可以单独播）
sfx("gust", "sfx", "一阵风", [S("gust")], -22)
sfx("thunder", "sfx", "远处的雷", [S("thunder")], -18)
sfx("gull", "sfx", "海鸥叫", [S("gull")], -22)
sfx("firecracker", "sfx", "鞭炮", [S("firecracker")], -20)
sfx("ice_crack", "sfx", "冰面裂开", [S("ice_crack")], -20)
sfx("leaf_rustle", "sfx", "落叶沙沙", [S("leaf_rustle")], -24)

# 角色
for n, use in [("driver_call", "司机喊一声"), ("driver_cheer", "司机高兴"), ("driver_grumble", "司机嘟囔")]:
    sfx(n, "voice", use, [S(n)], -19)
for n, use in [("hamster_hi", "仓鼠问好"), ("hamster_thanks", "仓鼠谢谢"), ("hamster_hmm", "仓鼠发愁")]:
    sfx(n, "voice", use, [S(n)], -20)
for k, n in [("soft", 5), ("beak", 4), ("bleat", 3), ("click", 3)]:
    for i in range(1, n + 1):
        sfx(f"syl_{k}_{i}", "voice", f"居民说话的音节（{k}，game/sound.ts 按物种调音高）", [S(f"syl_{k}_{i}")], -21,
            voices=6, gap=0)

# 环境声
bed("amb_river", "河水（每天全程）", "L:amb_river", -33, vol=0.9)
bed("amb_frogs", "远处蛙鸣（夏天、主页夜里）", "L:amb_frogs", -35)
bed("amb_birds", "春天的鸟叫（第 1 章、主页白天）", "A:amb_birds", -34)
bed("amb_cicadas", "夏天的蝉和蜻蜓（第 2 章）", "A:amb_cicadas", -35)
bed("amb_rain", "雨（第 3 章；暴雨夜带雷）", "A:amb_rain", -31, spots=dict(ids=["thunder"], every=[16, 34], volume=0.8))
bed("amb_wind", "秋风和落叶（第 4 章）", "A:amb_wind", -33, spots=dict(ids=["gust", "leaf_rustle"], every=[7, 15]))
bed("amb_winter", "冬天的冷风和冰（第 5 章）", "A:amb_winter", -33, spots=dict(ids=["ice_crack", "gust"], every=[9, 18]))
bed("amb_harbor", "港口的海浪和海鸥（第 6 章）", "A:amb_harbor", -33, spots=dict(ids=["gull"], every=[6, 14], volume=0.8))
bed("amb_crickets", "夜里的蟋蟀（夜路、主页夜里）", "A:amb_crickets", -35)
variant("amb_storm", "amb_rain", "amb", "暴雨（第 15 天）：雨更大、雷更密", vol=1.3,
        spots=dict(ids=["thunder"], every=[7, 15]))
variant("amb_blizzard", "amb_winter", "amb", "暴风雪（第 25 天）：风更急", vol=1.3, rate=1.15,
        spots=dict(ids=["gust", "ice_crack"], every=[4, 9]))
variant("amb_newyear", "amb_harbor", "amb", "年末烟花夜（第 30 天）：远处的鞭炮", vol=0.8,
        spots=dict(ids=["firecracker", "gull"], every=[3, 8], volume=0.7))

# 背景音乐（每章一首，按需下载；loop 用 loopfind.py 量出来，都是整小节）
music("bgm_title", "主页、路线图", "O:gone-fishin/beary_fishy_menu.mp3", loop=(10.6347, 44.8598), bass=-8)
music("bgm_work", "第 1 章 春 · 柳湾", "O:gone-fishin/gone_fishin.mp3", loop=(34.9809, 53.8603), bass=-8)
music("bgm_summer", "第 2 章 初夏 · 荷花塘", "O:happy-vibes/happy_vibes.mp3", vol=0.72)
music("bgm_rain", "第 3 章 雨季 · 急流峡", "O:down-the-river/down_the_river.mp3", loop=(12.1905, 85.872))
music("bgm_autumn", "第 4 章 秋 · 枫叶溪", "O:jazz-aug-15-ionion/aug_15_i_ver2.mp3", loop=(34.6674, 69.4169), vol=0.75, bass=-8)
music("bgm_winter", "第 5 章 冬 · 冰河", "O:4-music-box-tracks/musicbox2_cute_tune.ogg", loop=(26.4475, 68.5714))
music("bgm_harbor", "第 6 章 年末 · 港口集市", "O:childrens-march-theme/Children's March Theme.ogg")
music("bgm_spring", "第 7 章 早春 · 环河联运", "O:good-morning/good_morning.ogg", loop=(17.7981, 51.8919))
music("bgm_hq", "总部、大厅", "O:cozy-puzzle-in-game-3/cozy_puzzle_3.ogg", vol=0.72)
music("bgm_shop", "福利社", "O:4-music-box-tracks/musicbox4_happy_polka.ogg", loop=(28.0613, 42.8582), vol=0.7)
music("bgm_home", "小呱的家", "O:happy-ukelele-island-surfing-theme/ukele.mp3", loop=(16.0218, 72.7274), vol=0.72)
variant("bgm_hq_low", "bgm_hq", "music", "没过关时的总部：同一首，更轻更闷", vol=0.5, lowpass=1600)
variant("bgm_storm", "bgm_rain", "music", "暴雨夜班（第 15 天）：闷一点、慢一点", vol=0.75, rate=0.94, lowpass=2200)
variant("bgm_blizzard", "bgm_winter", "music", "暴风雪（第 25 天）：闷一点、慢一点", vol=0.75, rate=0.94, lowpass=2400)
variant("bgm_ending", "bgm_title", "music", "第 30 天之后的结局：主题曲从头再来", vol=0.9)


# ---------------------------------------------------------------- 处理

PAD = 0.3  # 循环文件前后各多放的秒数（mp3 编码在文件两头会有过渡，循环区间放在中间就不会咔哒）
MUSIC_EQ = [("hp", 60, 2, 0), ("peak", 2800, 2, 0.8)]


def mix_layers(layers, auto_trim=True):
    mix, credits = None, []
    for layer in layers:
        src, off, g = layer[:3]
        ts, te = (layer[3], layer[4]) if len(layer) > 3 else (None, None)
        path, meta = resolve(src)
        x = load(path)
        if ts is not None or te is not None:
            x = x[int((ts or 0) * SR): int(te * SR) if te else None]
        if auto_trim:
            x = trim(x, -45)
        x = x * 10 ** (g / 20)
        n = int(off * SR) + len(x)
        if mix is None: mix = np.zeros(n)
        if n > len(mix): mix = np.pad(mix, (0, n - len(mix)))
        mix[int(off * SR): int(off * SR) + len(x)] += x
        for c in meta:
            if c not in credits: credits.append(c)
    return mix, credits


def padded(loop):
    """循环段前面接上它的尾巴、后面接上它的开头；manifest 的 loopAt 指向中间那段。"""
    p = int(PAD * SR)
    return np.concatenate([loop[-p:], loop, loop[:p]])


def whole_loop(x, thr=1e-6):
    """
    整个文件当循环：只去掉首尾的静音。环境声和合成的循环用默认的 1e-6（只去解码器补的 0，安静的部分一个采样都不能少）；
    下载的整首音乐用 1e-3（原件 mp3 自己带几十毫秒的空白，不去掉每次循环都会顿一下）。
    """
    e = np.abs(x)
    idx = np.where(e > thr)[0]
    return x[idx[0]: idx[-1] + 1]


def gain_to(x, target, measure):
    return x * 10 ** ((target - measure(x)) / 20)


def report(id, x, full, ph, note=""):
    warn = "  <-- 手机外放小 %.1f dB" % (full - ph) if full - ph > 6 else ""
    print(f"{id:20s} {len(x) / SR:6.2f}s  {full:6.1f}  手机 {ph:6.1f}{warn} {note}")


def main():
    for sub in ("sfx", "amb", "bgm"):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)
        os.makedirs(os.path.join(OUT, sub))
    manifest, credits_by = {}, {}
    for e in E:
        id, kind = e["id"], e["kind"]
        item = dict(kind=kind, use=e["use"])
        if "of" in e:
            base = manifest[e["of"]]
            item.update(file=base["file"], of=e["of"], loop=base["loop"], volume=e["vol"])
            if e.get("rate"): item["rate"] = e["rate"]
            if e.get("lowpass"): item["lowpass"] = e["lowpass"]
            if e.get("spots"): item["spots"] = e["spots"]
            manifest[id] = item
            print(f"{id:20s} = {e['of']}")
            continue
        if kind == "music":
            x, credits = mix_layers([(e["src"], 0, 0)], auto_trim=False)
            x = eq(x, MUSIC_EQ + [("lowshelf", 220, e["bass"], 0.7)])
            if e["loop"]:
                s, length = e["loop"]
                loop = loop_xfade(x, s, length, e["xfade"])
            else:
                loop = whole_loop(x, 1e-3)
            loop = gain_to(loop, e["target"], integrated)
            y = limit(padded(loop), -1.0)
            rel = f"bgm/{id}.mp3"
            encode(y, os.path.join(OUT, rel), 40, out_sr=32000)
            item.update(file=rel, loop=True, volume=e["vol"], loopAt=[PAD, round(PAD + len(loop) / SR, 4)])
            if e["start"] is not None: item["from"] = round(PAD + e["start"], 3)
            report(id, loop, integrated(loop), integrated(phone(loop)), "(积分)")
        elif kind == "amb":
            x, credits = mix_layers([(e["src"], 0, 0)], auto_trim=False)
            loop = whole_loop(hp(x, 70, 2))
            loop = gain_to(loop, e["target"], integrated)
            y = limit(padded(loop), -3.0)
            rel = f"amb/{id}.mp3"
            encode(y, os.path.join(OUT, rel), e["kbps"], out_sr=32000)
            item.update(file=rel, loop=True, volume=e["vol"], loopAt=[PAD, round(PAD + len(loop) / SR, 4)])
            if e["spots"]: item["spots"] = e["spots"]
            report(id, loop, integrated(loop), integrated(phone(loop)), "(积分)")
        else:
            x, credits = mix_layers(e["layers"], auto_trim=not e["loop"])
            x = hp(x, 70, 2)
            if e["bands"]: x = eq(x, e["bands"])
            if e["loop"]:
                loop = whole_loop(x)
                peak_of = lambda v: float(momentary(np.tile(v, 3)).max())  # noqa: E731
                loop = gain_to(loop, e["target"], peak_of)
                y = limit(padded(loop), -1.0)
                item["loopAt"] = [PAD, round(PAD + len(loop) / SR, 4)]
            else:
                x = fade(x, fo=e["fo"])
                y = limit(gain_to(x, e["target"], lambda v: float(momentary(v).max())), -1.0)
            rel = f"sfx/{id}.mp3"
            encode(y, os.path.join(OUT, rel), 64)
            item.update(file=rel, loop=e["loop"], volume=e["vol"])
            if e["alt"]: item["variants"] = e["alt"]
            if e["preload"]: item["preload"] = True
            if e["gap"] is not None: item["gap"] = e["gap"]
            if e["voices"]: item["voices"] = e["voices"]
            report(id, y, float(momentary(y).max()), float(momentary(phone(y)).max()))
        item["duration"] = round(len(y) / SR, 2)
        item["bytes"] = os.path.getsize(os.path.join(OUT, item["file"]))
        item["credits"] = credits
        manifest[id] = item
        for c in credits:
            credits_by.setdefault(json.dumps(c, ensure_ascii=False, sort_keys=True), []).append(id)
    json.dump(dict(format="mp3 单声道（音效 44.1kHz 64kbps；音乐和环境声 32kHz 40kbps）", sounds=manifest),
              open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False, indent=1)
    write_credits(credits_by)
    total = {}
    for item in manifest.values():
        if "of" not in item: total[item["file"].split("/")[0]] = total.get(item["file"].split("/")[0], 0) + item["bytes"]
    print("总大小:", {k: f"{v / 1024:.0f}KB" for k, v in total.items()})


def write_credits(credits_by):
    rows, own = [], []
    for key, ids in sorted(credits_by.items(), key=lambda kv: json.loads(kv[0])["source"]):
        c = json.loads(key)
        if c["license"].startswith("原创"):
            own = ids
            continue
        rows.append(f"| {', '.join(ids)} | {c['source']} | {c['author']} | {c['url']} | {c['license']} |")
    with open(os.path.join(OUT, "CREDITS.md"), "w") as f:
        f.write("# 蛙趣蛙趣 音频来源与许可证\n\n")
        f.write("全部第三方素材均为 **CC0 1.0（公共领域）**：可免费商用、可修改，不要求署名。"
                "下面的名单留作记录，也放在游戏的「鸣谢」里。生成方法见 tools/audio/ 和 docs/audio.md。\n\n")
        f.write("| 用在 | 来源 | 作者 | 链接 | 许可证 |\n|---|---|---|---|---|\n")
        f.write("\n".join(rows) + "\n\n")
        f.write(f"## 代码原创合成（{len(own)} 个）\n\n全部由 tools/audio/synth.py、ambience.py 用代码合成，本项目原创，无限制：\n\n")
        f.write("、".join(own) + "\n")


main()
