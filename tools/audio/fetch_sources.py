# 下载 build.py 要用的第三方原件（全部 CC0）：Kenney 的几个音效包、OpenGameArt 的音乐原文件。
# 用法: python3 fetch_sources.py <下载目录>        -> <下载目录>/kenney/<包>/Audio/*.ogg、<下载目录>/oga/<作品>/<文件>
# 已经下过的文件跳过。Freesound 的素材没有在这里：它们以旧版母带（项目文件 wa-qu/audio/sfx、amb）的形式进来，
# 见 build.py 的 L: 来源。
import os, re, sys, zipfile, urllib.request, urllib.parse

DL = sys.argv[1]
KENNEY = ["interface-sounds", "rpg-audio", "impact-sounds", "music-jingles", "ui-audio", "casino-audio"]
OGA_BASE = "https://opengameart.org/sites/default/files/"
# (作品 slug, 网站上的文件名, 存成的文件名)；.zip 会就地解开
OGA = [
    ("childrens-march-theme", "childrens_march_theme.zip", "childrens_march_theme.zip"),
    ("down-the-river", "Komiku - It's time for adventure vol 2 - 05 Down the river_0.mp3", "down_the_river.mp3"),
    ("good-morning", "Cakeflaps - Good Morning_0.ogg", "good_morning.ogg"),
    ("happy-ukelele-island-surfing-theme", "ukele.mp3", "ukele.mp3"),
    ("happy-vibes", "ruskerdax_-_happy_vibes.mp3", "happy_vibes.mp3"),
    ("4-music-box-tracks", "4_music_box_tracks_ogg.zip", "4_music_box_tracks_ogg.zip"),
    ("jazz-aug-15-ionion", "aug_15_i_ver.2_0.mp3", "aug_15_i_ver2.mp3"),
    ("ukulele-forest-beginning-loop-and-end", "forest_loop.ogg", "forest_loop.ogg"),
    ("ukulele-forest-beginning-loop-and-end", "forest_beginning.ogg", "forest_beginning.ogg"),
    ("gone-fishin", "beary_fishy_menu_screen_by_memoraphile_CC0.mp3", "beary_fishy_menu.mp3"),
    ("gone-fishin", "gone_fishin_by_memoraphile_CC0_0.mp3", "gone_fishin.mp3"),
    ("gone-fishin", "the_reel_winner_by_memoraphile_CC0.mp3", "the_reel_winner.mp3"),
    ("cozy-puzzle-in-game-3", "cozy_puzzle_in-game_3_bpm108_0.ogg", "cozy_puzzle_3.ogg"),
]


def get(url, path, timeout=300):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (waqu-waqu audio build)"})
    with urllib.request.urlopen(req, timeout=timeout) as r, open(path + ".part", "wb") as f:
        f.write(r.read())
    os.replace(path + ".part", path)
    return True


def unzip(path):
    with zipfile.ZipFile(path) as z:
        for m in z.infolist():
            # 只解音频和说明，路径不许跳出目录
            name = os.path.normpath(m.filename)
            if name.startswith("..") or os.path.isabs(name) or m.is_dir():
                continue
            if not re.search(r"\.(ogg|mp3|wav|txt)$", name, re.I):
                continue
            out = os.path.join(os.path.dirname(path), name)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with z.open(m) as src, open(out, "wb") as dst:
                dst.write(src.read())


for pack in KENNEY:
    zpath = os.path.join(DL, "kenney", pack + ".zip")
    if not os.path.exists(zpath):
        page = urllib.request.urlopen(urllib.request.Request(
            f"https://kenney.nl/assets/{pack}", headers={"User-Agent": "Mozilla/5.0"}), timeout=30).read().decode("utf8", "replace")
        m = re.search(r'https://[^"]+\.zip', page)
        if not m:
            print("no zip link on", pack); continue
        get(m.group(0), zpath)
    os.makedirs(os.path.join(DL, "kenney", pack), exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(os.path.join(DL, "kenney", pack), [n for n in z.namelist() if not n.startswith(("/", "..")) and ".." not in n])
    print("kenney", pack)

for slug, remote, local in OGA:
    path = os.path.join(DL, "oga", slug, local)
    new = get(OGA_BASE + urllib.parse.quote(remote), path)
    if local.endswith(".zip"):
        unzip(path)
    print("oga", slug, local, "(downloaded)" if new else "(have)")
