# 把下载/合成的素材统一裁剪、响度、混合、循环处理，输出单声道 mp3 + manifest.json + CREDITS
# 用法: python3 build.py <素材根目录 sfx/> <合成目录 build/synth> <输出目录>
import sys, os, json, subprocess
import numpy as np

SR = 44100
DL, SYN, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

KENNEY_PACK = {
    "interface-sounds": "Interface Sounds", "rpg-audio": "RPG Audio", "impact-sounds": "Impact Sounds",
    "casino-audio": "Casino Audio", "ui-audio": "UI Audio", "music-jingles": "Music Jingles",
}
FS_META = json.load(open(os.path.join(DL, "dl/fs/meta.json")))
OGA = {  # OpenGameArt 曲目信息
    "gone-fishin": ("Gone Fishin' / Beary Fishy Menu Screen / The Reel Winner", "Memoraphile @ You're Perfect Studio"),
    "cozy-puzzle-in-game-3": ("Cozy Puzzle In-Game 3", "mintodog"),
    "childrens-march-theme": ("Children's March Theme", "Cleyton Kauffman"),
    "down-the-river": ("Down the River", "Komiku (Loyalty Freak Music)"),
    "ukulele-forest-beginning-loop-and-end": ("Ukulele Forest", "StarNinjas"),
    "happy-vibes": ("Happy Vibes", "Ruskerdax"),
    "4-music-box-tracks": ("4 Music Box Tracks", "AureolusOmicron"),
    "jazz-aug-15-ionion": ("Jazz Aug 15 <> Ionion", "pro-sensory"),
    "good-morning": ("Good Morning", "Cakeflaps @ You're Perfect Studio"),
    "happy-ukelele-island-surfing-theme": ("Happy Ukelele Island Surfing Theme", "Tarush Singhal"),
}


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    assert len(x), path
    return x


def resolve(src):
    kind, ref = src.split(":", 1)
    if kind == "K":
        pack, f = ref.split("/", 1)
        p = os.path.join(DL, "dl/kenney", pack, "Audio", f)
        return p, dict(source="Kenney · " + KENNEY_PACK[pack], author="Kenney (kenney.nl)",
                       url=f"https://kenney.nl/assets/{pack}", license="CC0 1.0", file=f)
    if kind == "F":
        m = FS_META[ref]
        return os.path.join(DL, "dl/fs", ref + ".mp3"), dict(
            source="Freesound · " + m["title"], author=m["user"], url=m["url"], license="CC0 1.0")
    if kind == "S":
        return os.path.join(SYN, ref + ".wav"), dict(
            source="代码合成 · tools/synth.py", author="本项目原创", url="", license="原创，无限制")
    if kind == "O":
        slug, f = ref.split("/", 1)
        title, author = OGA[slug]
        return os.path.join(DL, "dl/oga", slug, f), dict(
            source="OpenGameArt · " + title, author=author, url=f"https://opengameart.org/content/{slug}",
            license="CC0 1.0", file=f)
    raise ValueError(src)


def db(x):
    return 20 * np.log10(x + 1e-12)


def active_rms(x):
    hop = 441
    n = max(1, len(x) // hop)
    fr = x[: n * hop].reshape(n, hop)
    r = np.sqrt((fr ** 2).mean(1))
    a = r[r > r.max() * 10 ** (-30 / 20)]
    return np.sqrt((a ** 2).mean())


def trim(x, start=None, end=None, auto=True):
    if start is not None or end is not None:
        x = x[int((start or 0) * SR): int(end * SR) if end else None]
    if auto:
        e = np.abs(x)
        thr = e.max() * 10 ** (-45 / 20)
        idx = np.where(e > thr)[0]
        a = max(0, idx[0] - int(0.004 * SR))
        b = min(len(x), idx[-1] + int(0.01 * SR))
        x = x[a:b]
    return x


def fade(x, fi=0.003, fo=0.02):
    x = x.copy()
    ni, no = int(fi * SR), int(fo * SR)
    if ni: x[:ni] *= np.linspace(0, 1, ni)
    if no: x[-no:] *= np.linspace(1, 0, no) ** 1.5
    return x


def make_loop(x, length, xfade):
    """取 length 秒，并把其后 xfade 秒交叉淡入到开头，得到无缝循环。"""
    L, X = int(length * SR), int(xfade * SR)
    seg = x[: L + X].copy()
    head, tail = seg[:X], seg[L:L + X]
    w = np.linspace(0, 1, X)
    seg[:X] = head * np.sqrt(w) + tail * np.sqrt(1 - w)
    return seg[:L]


def encode(x, path, kbps):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2").tobytes()
    subprocess.run(["ffmpeg", "-v", "quiet", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-map_metadata", "-1", path], input=pcm, check=True)


# ---- 清单 ----
# layers: (源, 起始偏移秒, 增益dB, 裁剪起, 裁剪止)
# target: 主体段 RMS 目标 dBFS；peak 上限 -1 dBFS
E = []


def add(id, group, use, layers, target, loop=None, kbps=64, fo=0.02, vol=1.0, alt=None):
    E.append(dict(id=id, group=group, use=use, layers=layers, target=target, loop=loop, kbps=kbps, fo=fo,
                  vol=vol, alt=alt))


# 界面
add("ui_tap", "ui", "普通按钮点击", [("K:interface-sounds/select_001.ogg", 0, 0, None, None)], -24)
add("ui_confirm", "ui", "确认/领取成功", [("K:interface-sounds/confirmation_001.ogg", 0, 0, None, None)], -22)
add("ui_back", "ui", "返回/取消", [("K:interface-sounds/back_001.ogg", 0, 0, None, None)], -24)
add("ui_open", "ui", "打开浮层（背包、订单）", [("K:interface-sounds/open_001.ogg", 0, 0, None, None)], -24)
add("ui_close", "ui", "关闭浮层", [("K:interface-sounds/close_001.ogg", 0, 0, None, None)], -24)
add("ui_error", "ui", "操作无效（如背包已满时再领取）", [("K:interface-sounds/error_001.ogg", 0, 0, None, None)], -22)
add("ui_tick", "ui", "结算数字滚动/逐条计数", [("K:interface-sounds/tick_001.ogg", 0, 0, None, None)], -26)

# 跳跃
add("jump_charge", "jump", "按住蓄力（松手时停止播放；力度越大可调高 playbackRate）",
    [("S:jump_charge", 0, 0, None, None)], -22, fo=0.05)
add("jump_charge_max", "jump", "蓄力满", [("S:jump_charge_max", 0, 0, None, None)], -22)
add("aim_predict", "jump", "瞄准约 2 秒后出现预测虚线", [("S:aim_predict", 0, 0, None, None)], -24)
add("jump_release", "jump", "松手起跳（弹弓'嗖-boing'）", [("S:jump_release", 0, 0, None, None)], -17)
add("jump_whoosh", "jump", "空中风声（远跳时可叠加）", [("S:jump_whoosh", 0, 0, None, None)], -24)
add("frog_croak", "jump", "青蛙叫：起跳/成功落地/待机随机播放", [("F:447917", 0, 0, None, None)], -18,
    alt=["frog_croak_2"])
add("frog_croak_2", "jump", "青蛙叫（短促变体，与 frog_croak 随机轮换）", [("F:536759", 0, 0, None, None)], -18)
add("land_truck", "jump", "落在运输车上（金属轻响 + 回弹'啵'）",
    [("K:impact-sounds/impactMetal_light_000.ogg", 0, 0, None, None), ("S:land_bloop", 0.005, -6, None, None)], -18)
add("land_pad", "jump", "落在荷叶/浮木上（软软的啪嗒 + 一点水声）",
    [("F:445117", 0, 0, None, None), ("F:737232", 0.01, -9, None, None), ("S:land_bloop", 0.0, -8, None, None)], -18)
add("land_house", "jump", "落在居民房屋上（木头）",
    [("K:impact-sounds/impactWood_light_000.ogg", 0, 0, None, None), ("S:land_bloop", 0.005, -8, None, None)], -18)

# 落水 / 游泳
add("fall_whistle", "water", "跳空下坠的卡通滑哨（入水前）", [("S:fall_whistle", 0, 0, None, None)], -22)
add("splash", "water", "掉进河里", [("F:398032", 0, 0, None, None)], -15)
add("swim_stroke", "water", "游泳时每次点击划水（与 swim_stroke_2 轮换，可随机音高）",
    [("F:737233", 0, 0, None, None)], -20, alt=["swim_stroke_2"])
add("swim_stroke_2", "water", "划水变体", [("F:737234", 0, 0, None, None)], -20)
add("swim_bubbles", "water", "落水期间的咕噜水泡（可循环，提示快速连点）", [("S:swim_bubbles", 0, 0, None, None)], -28,
    loop=dict(length=None, music=True))
add("swim_climb", "water", "成功游上岸", [("S:swim_climb", 0, 0, None, None)], -18)
add("parcel_soaked", "water", "背包包裹泡水损坏提示", [("F:737232", 0, 0, None, None), ("S:bag_full", 0.08, -4, None, None)], -20)

# 车辆
add("truck_slowdown", "truck", "青蛙回到车上，车辆减速", [("S:truck_slowdown", 0, 0, None, None)], -24)
add("truck_speedup", "truck", "再次起跳，车辆恢复速度", [("S:truck_speedup", 0, 0, None, None)], -24)
add("truck_horn", "truck", "上班出发/下班到站（卡通喇叭）", [("F:188039", 0, 0, None, None)], -18)
add("truck_engine_loop", "truck", "运输车发动机底噪（循环，音量放很低）", [("F:186935", 0, 0, None, None)], -30,
    loop=dict(length=5.0, xfade=0.6), vol=0.35)

# 包裹 / 订单 / 居民
add("parcel_pickup", "parcel", "从车上领取包裹", [("F:441649", 0, 0, 0.15, 0.8)], -20)
add("parcel_place", "parcel", "把包裹交给居民", [("K:rpg-audio/bookPlace1.ogg", 0, 0, None, None)], -20)
add("bag_open", "parcel", "打开背包", [("K:rpg-audio/cloth1.ogg", 0, 0, None, None)], -22)
add("bag_full", "parcel", "背包满/超重", [("S:bag_full", 0, 0, None, None)], -20)
add("deliver_happy", "parcel", "居民开心签收", [("S:deliver_happy", 0, 0, None, None)], -18)
add("deliver_confused", "parcel", "居民疑惑（没买东西/送错）", [("S:deliver_confused", 0, 0, None, None)], -18)
add("deliver_unhappy", "parcel", "居民不满（加急迟到等）", [("S:deliver_unhappy", 0, 0, None, None)], -18)
add("coin", "parcel", "获得金币/奖励", [("S:coin", 0, 0, None, None)], -20)
add("cash_register", "parcel", "货到付款收款", [("S:cash_register", 0, 0, None, None)], -20)
add("coins_change", "parcel", "找零时数硬币", [("K:rpg-audio/handleCoins.ogg", 0, 0, None, None)], -22)
add("urgent_alert", "parcel", "出现加急订单/加急快超时", [("S:urgent_alert", 0, 0, None, None)], -18)
add("urgent_tick_loop", "parcel", "加急倒计时最后 10 秒的滴答（循环）", [("F:212181", 0, 0, None, None)], -24,
    loop=dict(length=None, music=True))
add("urgent_late", "parcel", "加急超时", [("S:urgent_late", 0, 0, None, None)], -20)
add("phone_ring", "parcel", "居民打电话催单（老式电话铃，一声）", [("F:332073", 0, 0, 0.0, 1.35)], -22, fo=0.12)

# 一天结束 / 总部
add("day_fail", "hq", "被甩出屏幕、当天提前结束（卡通失败长号）", [("S:day_fail", 0, 0, None, None)], -18)
add("day_complete", "hq", "完成当天路线（胜利小乐句，与 BGM 同一作者）",
    [("O:gone-fishin/the_reel_winner_by_memoraphile_CC0.mp3", 0, 0, None, None)], -18, fo=0.3)
add("owl_hoot", "hq", "猫头鹰经理出场/点评", [("F:164652", 0, 0, None, None)], -20)
add("paper_flip", "hq", "翻阅单据", [("K:rpg-audio/bookFlip1.ogg", 0, 0, None, None)], -22, alt=["paper_flip_2"])
add("paper_flip_2", "hq", "翻页变体", [("K:rpg-audio/bookFlip2.ogg", 0, 0, None, None)], -22)
add("stamp", "hq", "盖章", [("F:470710", 0, 0, None, None)], -16)
add("photo_shutter", "hq", "今日精彩瞬间：照片定格", [("F:61059", 0, 0, None, None)], -20)
add("rating_good", "hq", "评级揭晓（好）", [("K:music-jingles/Pizzicato jingles/jingles_PIZZI06.ogg", 0, 0, None, None)], -18, fo=0.15)
add("rating_bad", "hq", "评级揭晓（差）", [("K:music-jingles/Pizzicato jingles/jingles_PIZZI04.ogg", 0, 0, None, None)], -18, fo=0.15)
add("upgrade", "hq", "购买装备升级", [("S:upgrade", 0, 0, None, None)], -18)

# 环境声
add("amb_river", "amb", "河流流水环境声（全程循环，低音量）", [("F:415151", 0, 0, 2.0, None)], -30,
    loop=dict(length=16.0, xfade=1.5), kbps=48, vol=0.5)
add("amb_frogs", "amb", "远处蛙鸣（可选，叠在河流上，偶尔播放）", [("F:573584", 0, 0, None, None)], -32,
    loop=dict(length=10.0, xfade=1.5), kbps=48, vol=0.4)

# 背景音乐
add("bgm_title", "bgm", "标题/菜单", [("O:gone-fishin/beary_fishy_menu_screen_by_memoraphile_CC0.mp3", 0, 0, None, None)], -20,
    loop=dict(length=None, music=True), kbps=64, vol=0.6)
add("bgm_work", "bgm", "白天配送（主玩法）", [("O:gone-fishin/gone_fishin_by_memoraphile_CC0_0.mp3", 0, 0, None, None)], -20,
    loop=dict(length=None, music=True), kbps=64, vol=0.55)
add("bgm_hq", "bgm", "总部结算", [("O:cozy-puzzle-in-game-3/cozy_puzzle_in-game_3_bpm108.mp3", 0, 0, None, None)], -21,
    loop=dict(length=None, music=True), kbps=64, vol=0.55)

# 备选音乐（只放试听页，不进游戏包）
ALT_MUSIC = [
    ("alt_childrens_march", "白天配送备选：进行曲，轻快马戏感，原作说可无缝循环", "O:childrens-march-theme/Children's March Theme.ogg"),
    ("alt_down_the_river", "白天配送备选：曲名就叫“顺流而下”", "O:down-the-river/Komiku - It's time for adventure vol 2 - 05 Down the river_0.mp3"),
    ("alt_ukulele_forest", "白天配送备选：真尤克里里，8 秒小循环，体积极小", "O:ukulele-forest-beginning-loop-and-end/forest_loop.ogg"),
    ("alt_happy_vibes", "白天配送备选：海岛风轻快小调", "O:happy-vibes/ruskerdax_-_happy_vibes.mp3"),
    ("alt_happy_ukulele", "白天配送备选：尤克里里冲浪风", "O:happy-ukelele-island-surfing-theme/ukele.mp3"),
    ("alt_musicbox_cute", "总部结算备选：八音盒可爱曲", "O:4-music-box-tracks/musicbox2_cute_tune.ogg"),
    ("alt_jazz", "总部结算备选：轻爵士，办公室感", "O:jazz-aug-15-ionion/aug_15_i_ver.2_0.mp3"),
    ("alt_good_morning", "标题备选：早安小曲", "O:good-morning/Cakeflaps - Good Morning_0.ogg"),
]


def render(e):
    mix = None
    credits = []
    for src, off, g, ts, te in e["layers"]:
        path, meta = resolve(src)
        x = load(path)
        music = e["loop"] and e["loop"].get("music")
        x = trim(x, ts, te, auto=not music and not (e["loop"] and e["loop"].get("length")))
        x = x * 10 ** (g / 20)
        n = int(off * SR) + len(x)
        if mix is None: mix = np.zeros(n)
        if n > len(mix): mix = np.pad(mix, (0, n - len(mix)))
        mix[int(off * SR): int(off * SR) + len(x)] += x
        if meta not in credits: credits.append(meta)
    if e["loop"] and e["loop"].get("length"):
        mix = make_loop(mix, e["loop"]["length"], e["loop"]["xfade"])
    elif e["loop"] and e["loop"].get("music"):
        pass  # 音乐保持原样（作者已做成可循环）
    elif e["loop"]:
        mix = trim(mix)
    else:
        mix = fade(mix, fo=e["fo"])
    gain = e["target"] - db(active_rms(mix))
    gain = min(gain, -1.0 - db(np.abs(mix).max()))
    mix = mix * 10 ** (gain / 20)
    return mix, credits


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for e in E:
        sub = "bgm" if e["group"] == "bgm" else ("amb" if e["group"] == "amb" else "sfx")
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)
        x, credits = render(e)
        rel = f"{sub}/{e['id']}.mp3"
        encode(x, os.path.join(OUT, rel), e["kbps"])
        item = dict(file=rel, group=e["group"], use=e["use"], duration=round(len(x) / SR, 2),
                    loop=bool(e["loop"]), volume=e["vol"], bytes=os.path.getsize(os.path.join(OUT, rel)),
                    credits=credits)
        if e["alt"]: item["variants"] = e["alt"]
        manifest[e["id"]] = item
        print(f"{e['id']:20s} {item['duration']:6.2f}s {item['bytes']/1024:7.1f}KB")
    alt_dir = os.path.join(OUT, "_audition_only")
    os.makedirs(alt_dir, exist_ok=True)
    alts = {}
    for id, use, src in ALT_MUSIC:
        path, meta = resolve(src)
        x = load(path)
        x = x * 10 ** ((-20 - db(active_rms(x))) / 20)
        x = x * min(1, 10 ** (-1 / 20) / np.abs(x).max())
        rel = f"_audition_only/{id}.mp3"
        encode(x, os.path.join(OUT, rel), 64)
        alts[id] = dict(file=rel, use=use, duration=round(len(x) / SR, 1), credits=[meta])
        print(f"{id:20s} {len(x)/SR:6.1f}s {os.path.getsize(os.path.join(OUT, rel))/1024:7.1f}KB (alt)")
    json.dump(dict(format="mp3 单声道 44.1kHz", sounds=manifest), open(os.path.join(OUT, "manifest.json"), "w"),
              ensure_ascii=False, indent=1)
    json.dump(alts, open(os.path.join(alt_dir, "alternates.json"), "w"), ensure_ascii=False, indent=1)


main()
