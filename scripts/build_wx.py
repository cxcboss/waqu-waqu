#!/usr/bin/env python3
"""Builds the WeChat mini game into dist-wx/, ready to open in WeChat DevTools (微信开发者工具).

  npm run build:wx                      # tourist AppID (touristappid): runs in DevTools, can't be uploaded
  npm run build:wx -- --appid wx123…    # the mini game's own AppID (mp.weixin.qq.com → 开发 → 开发管理)
  npm run build:wx -- --tm              # also send play statistics (only once their server is a 服务器域名)

What it does:
  game.js     src/main.wx.ts and the whole game bundled by esbuild (src/platform/wx.ts is the wx side)
  fonts/      the subset 霞鹜文楷 fonts as TTF (the package takes no woff2), renamed to the families WK / WKB
  core/       main package art: the sprites the first screen needs (CORE in src/art/sprites.ts), the art
              manifest, files.json (sprite -> file) and the share card; plus wx/ (share.jpg, OFL.txt)
  art/        subpackage "art": every other sprite
  audio/      subpackage "audio": public/audio, except that each looping file (music, ambience, the engine) is cut
              down to its loop (the mini game plays sound on the system's player, which loops whole files; needs ffmpeg)
The package takes no WebP either, so art is turned back into PNG (shrunk to 256 colours with pngquant when it's
installed) or JPEG when it has no transparency. Converted files are cached in node_modules/.cache/wx-art.
Limits: main package 4 MB, everything 30 MB. The script prints the sizes and fails if they're over.
Needs: node (npm ci), Pillow, fontTools, numpy (pip install pillow fonttools brotli numpy), ffmpeg, optionally pngquant.
"""
import argparse, datetime, hashlib, io, json, os, shutil, subprocess, sys

from PIL import Image
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
OUT = os.path.join(ROOT, 'dist-wx')
CACHE = os.path.join(ROOT, 'node_modules', '.cache', 'wx-art')
AUDIO_CACHE = os.path.join(ROOT, 'node_modules', '.cache', 'wx-audio')
MAIN_MAX = 4 * 1024 * 1024
TOTAL_MAX = 30 * 1024 * 1024
# kept when dist-wx is rebuilt: DevTools keeps this developer's own settings there
KEEP = {'project.private.config.json'}

ap = argparse.ArgumentParser()
ap.add_argument('--appid', default=os.environ.get('WX_APPID', 'touristappid'))
ap.add_argument('--tm', action='store_true', help='send play statistics (see docs/telemetry.md)')
args = ap.parse_args()


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, check=True, **kw)


def build_id():
    try:
        rev = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        rev = 'local'
    d = datetime.datetime.now(datetime.timezone.utc)
    return f'{rev}.{d.month:02d}{d.day:02d}.wx'


def clean():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f in KEEP:
            continue
        p = os.path.join(OUT, f)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)


def bundle():
    run(['npx', 'esbuild', 'src/main.wx.ts', '--bundle', '--minify', '--target=es2019', '--format=iife', '--legal-comments=none',
         f'--define:__BUILD__={json.dumps(build_id())}', f'--define:__WX_TM__={"true" if args.tm else "false"}',
         '--outfile=' + os.path.join(OUT, 'game.js'), '--log-level=warning'])


def core_sprites():
    """The sprites src/art/sprites.ts loads before the first screen."""
    probe = ("import { CORE, SPRITE_DEFS } from './src/art/sprites';"
             "console.log(JSON.stringify(Object.keys(SPRITE_DEFS).filter((n) => !SPRITE_DEFS[n].lazy && CORE.test(n))));")
    js = run(['npx', 'esbuild', '--bundle', '--platform=node', '--format=cjs', '--log-level=warning', '--sourcefile=probe.ts', '--loader=ts'],
             input=probe, capture_output=True, text=True).stdout
    return set(json.loads(subprocess.run(['node'], input=js, capture_output=True, text=True, check=True).stdout))


def convert(src):
    """A WebP as (bytes, ext): JPEG when fully opaque, otherwise a PNG (256 colours with pngquant). Cached by content."""
    data = open(src, 'rb').read()
    key = hashlib.sha1(data).hexdigest()
    for ext in ('.jpg', '.png'):
        hit = os.path.join(CACHE, key + ext)
        if os.path.exists(hit):
            return open(hit, 'rb').read(), ext
    im = Image.open(io.BytesIO(data))
    im.load()
    rgba = im.convert('RGBA')
    buf = io.BytesIO()
    if rgba.getchannel('A').getextrema()[0] == 255:
        ext = '.jpg'
        rgba.convert('RGB').save(buf, 'JPEG', quality=88, optimize=True)
        out = buf.getvalue()
    else:
        ext = '.png'
        rgba.save(buf, 'PNG', optimize=True)
        out = buf.getvalue()
        if shutil.which('pngquant'):
            q = subprocess.run(['pngquant', '--quality=65-95', '--speed', '3', '--strip', '-'], input=out, capture_output=True)
            # exit 98/99: not smaller or below the quality floor, keep the full PNG
            if q.returncode == 0 and q.stdout:
                out = q.stdout
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, key + ext), 'wb') as f:
        f.write(out)
    return out, ext


def art():
    core = core_sprites()
    names = json.load(open(os.path.join(PUB, 'art', 'manifest.json')))
    files = {}
    for name in names:
        src = os.path.join(PUB, 'art', name + '.webp')
        if not os.path.exists(src):
            continue
        data, ext = convert(src)
        rel = ('core/art/' if name in core else 'art/') + name + ext
        os.makedirs(os.path.dirname(os.path.join(OUT, rel)), exist_ok=True)
        with open(os.path.join(OUT, rel), 'wb') as f:
            f.write(data)
        files[name] = rel
    json.dump(names, open(os.path.join(OUT, 'core', 'art', 'manifest.json'), 'w'), separators=(',', ':'))
    json.dump(files, open(os.path.join(OUT, 'core', 'art', 'files.json'), 'w'), separators=(',', ':'))
    return len(files), len([n for n in files if n in core])


def fonts():
    os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
    for src, family in (('wk-regular', 'WK'), ('wk-bold', 'WKB')):
        f = TTFont(os.path.join(PUB, 'fonts', src + '.woff2'))
        f.flavor = None
        # wx.loadFont registers a font under the family written inside it, so name it what the game draws with
        name = f['name']
        for rec in list(name.names):
            if rec.nameID in (1, 3, 4, 6, 16, 17):
                name.removeNames(nameID=rec.nameID)
        for nid, v in ((1, family), (2, 'Regular'), (3, family + '-subset'), (4, family), (6, family)):
            name.setName(v, nid, 3, 1, 0x409)
        f.save(os.path.join(OUT, 'fonts', src + '.ttf'))
    shutil.copy(os.path.join(ROOT, 'wx', 'OFL.txt'), os.path.join(OUT, 'fonts', 'OFL.txt'))


def loop_body(src, start, end):
    """A looping sound cut down to its loop region, as (mp3 bytes, seconds): decoded, cut where the manifest's
    loopAt says (counted from the first sound, as src/engine/audio.ts does) and encoded again. Cached."""
    import numpy as np
    data = open(src, 'rb').read()
    key = hashlib.sha1(data + f'{start}:{end}:v2'.encode()).hexdigest()
    hit = os.path.join(AUDIO_CACHE, key + '.mp3')
    sr = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', src],
                            capture_output=True, text=True, check=True).stdout.strip())
    if not os.path.exists(hit):
        pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '1', '-ar', str(sr), '-'], capture_output=True, check=True).stdout
        x = np.frombuffer(pcm, dtype=np.float32)
        lead = int(np.argmax(np.abs(x) >= 1e-4))
        body = x[lead + round(start * sr):lead + round(end * sr)]
        # a little above the original 40 kbps, so encoding a second time costs nothing you can hear; into a file, not a
        # pipe, so ffmpeg can go back and fill in the LAME header (its length and encoder delay, for a gapless loop)
        os.makedirs(AUDIO_CACHE, exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '48k', hit + '.tmp.mp3'],
                       input=body.tobytes(), capture_output=True, check=True)
        os.replace(hit + '.tmp.mp3', hit)
    return open(hit, 'rb').read(), (round(end * sr) - round(start * sr)) / sr


def audio():
    dst = os.path.join(OUT, 'audio')
    # .md isn't a file type the package takes; the credits go in as .txt
    shutil.copytree(os.path.join(PUB, 'audio'), dst, ignore=shutil.ignore_patterns('*.md'))
    shutil.copy(os.path.join(PUB, 'audio', 'CREDITS.md'), os.path.join(dst, 'CREDITS.txt'))
    # The mini game plays every sound on the system's player (InnerAudioContext), which loops whole files: each looping
    # sound becomes just its loop, without the run-in and run-out that let Web Audio loop it seamlessly, and its loopAt
    # says so.
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is needed to cut the looping sounds to their loops (apt install ffmpeg / brew install ffmpeg)')
    path = os.path.join(dst, 'manifest.json')
    man = json.load(open(path, encoding='utf-8'))
    n = 0
    for e in man['sounds'].values():
        if not e.get('loop') or e.get('of') or not e.get('loopAt'):
            continue
        out, secs = loop_body(os.path.join(PUB, 'audio', e['file']), *e['loopAt'])
        with open(os.path.join(dst, e['file']), 'wb') as f:
            f.write(out)
        e['loopAt'] = [0, round(secs, 3)]
        e['duration'] = round(secs, 2)
        e['bytes'] = len(out)
        n += 1
    json.dump(man, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'audio: {n} looping sounds cut to their loops')


def project():
    # every subpackage needs a game.js of its own; these only hold files
    for sub in ('art', 'audio'):
        with open(os.path.join(OUT, sub, 'game.js'), 'w') as f:
            f.write('// files only (see scripts/build_wx.py)\n')
    shutil.copy(os.path.join(ROOT, 'wx', 'share.jpg'), os.path.join(OUT, 'core', 'share.jpg'))
    game = {
        'deviceOrientation': 'portrait',
        'showStatusBar': False,
        'networkTimeout': {'request': 8000},
        'subpackages': [{'name': 'art', 'root': 'art/'}, {'name': 'audio', 'root': 'audio/'}],
        # the art comes down alongside the main package, so the first day rarely waits for it
        'parallelPreloadSubpackages': [{'name': 'art'}],
    }
    json.dump(game, open(os.path.join(OUT, 'game.json'), 'w'), ensure_ascii=False, indent=2)
    cfg = {
        'appid': args.appid,
        'projectname': 'waqu-waqu',
        'compileType': 'game',
        'description': '蛙趣蛙趣 微信小游戏（scripts/build_wx.py 生成，别手改，改了下次打包会被覆盖）',
        'setting': {'es6': False, 'enhance': False, 'minified': False, 'postcss': False, 'urlCheck': True, 'uploadWithSourceMap': False},
        'packOptions': {'ignore': [], 'include': []},
        'editorSetting': {'tabIndent': 'insertSpaces', 'tabSize': 2},
    }
    json.dump(cfg, open(os.path.join(OUT, 'project.config.json'), 'w'), ensure_ascii=False, indent=2)


def size(path):
    if os.path.isfile(path):
        return os.path.getsize(path)
    return sum(os.path.getsize(os.path.join(b, f)) for b, _, fs in os.walk(path) for f in fs)


def report():
    subs = {s: size(os.path.join(OUT, s)) for s in ('art', 'audio')}
    total = sum(size(os.path.join(OUT, f)) for f in os.listdir(OUT) if f not in KEEP)
    main = total - sum(subs.values())
    mb = lambda n: f'{n / 1024 / 1024:.2f} MB'
    print(f'main package {mb(main)} (game.js {mb(size(os.path.join(OUT, "game.js")))}, fonts {mb(size(os.path.join(OUT, "fonts")))}, core {mb(size(os.path.join(OUT, "core")))})')
    for s, n in subs.items():
        print(f'subpackage {s}: {mb(n)}')
    print(f'total {mb(total)}  ->  {OUT}')
    if main > MAIN_MAX or total > TOTAL_MAX:
        sys.exit('over the WeChat limits (main 4 MB, total 30 MB)')


clean()
bundle()
n, ncore = art()
print(f'art: {n} sprites, {ncore} in the main package')
fonts()
audio()
project()
report()
if args.appid == 'touristappid':
    print('tourist AppID: fine for trying it in DevTools; build with --appid to preview on a phone or upload')
