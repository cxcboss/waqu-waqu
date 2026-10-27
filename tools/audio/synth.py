# 蛙趣蛙趣 卡通音效合成（全部原创，可随意商用）
# 用法: python3 synth.py <输出目录> [名字…]   -> 每个音效一个 44.1k 单声道 wav（不给名字就全部生成）
#
# 设计规矩（2026-10 审计后）：
# - 手机外放 450 Hz 以下基本听不见：反馈音的基频放在 350–900 Hz，谐波到 3–4 kHz，低频只做点缀。
# - 有音高的音效只用 A、B、D、E 四个音（A 大调、D 大调、G 大调、B 小调、A 小调、E 小调里都有），
#   所以无论哪一章的音乐在放都不打架；总部的评级、升职用 G 小调 / 降 B 大调（总部音乐的调）。
# - 每个函数上方的中文说明写这是什么声音、在哪里用。
import sys, os, wave
import numpy as np
from scipy import signal

SR = 44100
OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

# 音名 → 频率（A4 = 440）
NOTE = {}
for octave in range(2, 9):
    for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]):
        NOTE[f"{n}{octave}"] = 440 * 2 ** ((i - 9) / 12 + (octave - 4))
NOTE.update({k.replace("A#", "Bb"): v for k, v in NOTE.items() if "A#" in k})
NOTE.update({k.replace("D#", "Eb"): v for k, v in NOTE.items() if "D#" in k})
NOTE.update({k.replace("F#", "Gb"): v for k, v in NOTE.items() if "F#" in k})


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def osc(freq, dur, shape="sine"):
    """freq 可以是常数或与时长等长的数组（扫频）。"""
    n = int(dur * SR)
    f = np.full(n, freq, float) if np.isscalar(freq) else np.asarray(freq, float)[:n]
    ph = 2 * np.pi * np.cumsum(f) / SR
    if shape == "sine":
        return np.sin(ph)
    if shape == "tri":
        return 2 / np.pi * np.arcsin(np.sin(ph))
    if shape == "saw":
        # 加法合成的限带锯齿，避免刺耳混叠
        y = np.zeros(n)
        for k in range(1, 24):
            y += np.sin(k * ph) / k * (k * f < SR / 2.2)
        return y * 0.6
    if shape == "square":
        y = np.zeros(n)
        for k in range(1, 24, 2):
            y += np.sin(k * ph) / k * (k * f < SR / 2.2)
        return y * 0.8
    raise ValueError(shape)


def sweep(f0, f1, dur, curve="exp"):
    t = t_axis(dur) / dur
    return f0 * (f1 / f0) ** t if curve == "exp" else f0 + (f1 - f0) * t


def env(dur, a=0.005, d=None, decay=None, r=0.02):
    """a=起音, decay=指数衰减速度(每秒), r=尾部淡出。"""
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na) ** 0.7
    if decay:
        e *= np.exp(-decay * np.maximum(t - a, 0))
    nr = max(1, int(r * SR))
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, fc, order=2):
    sos = signal.butter(order, fc, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, fc, order=2):
    sos = signal.butter(order, fc, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep_bp(x, f0, f1, q=2.0, blk=128):
    """带通的中心频率随时间从 f0 滑到 f1（逐块换系数，保留滤波器状态，不会咔哒）。"""
    n = len(x)
    fc = f0 * (f1 / f0) ** (np.arange(0, n, blk) / max(1, n - 1))
    out = np.zeros(n)
    zi = np.zeros(2)
    for j, c in enumerate(fc):
        w0 = 2 * np.pi * min(c, SR * 0.45) / SR
        al = np.sin(w0) / (2 * q)
        b = np.array([al, 0, -al]) / (1 + al)
        a = np.array([1, -2 * np.cos(w0) / (1 + al), (1 - al) / (1 + al)])
        seg = x[j * blk:(j + 1) * blk]
        out[j * blk:j * blk + len(seg)], zi = signal.lfilter(b, a, seg, zi=zi)
    return out


def marimba(f, dur=0.6, bright=1.0):
    t = t_axis(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 6)
    y += 0.35 * bright * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 28)
    y += 0.12 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 60)
    return y * env(dur, a=0.002, r=0.03)


def kalimba(f, dur=0.8):
    t = t_axis(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 4.5)
    y += 0.3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 25)
    y += 0.08 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 9)
    return y * env(dur, a=0.001, r=0.05)


def bell(f, dur=1.0):
    t = t_axis(dur)
    y = np.zeros_like(t)
    for ratio, amp, dec in [(1, 1, 3), (2.76, 0.4, 6), (5.4, 0.2, 10), (8.93, 0.08, 16)]:
        y += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return y * env(dur, a=0.001, r=0.05)


def glock(f, dur=0.8):
    """钟琴：比 bell 更亮更短，做闪光点缀。"""
    t = t_axis(dur)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 5)
    y += 0.5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 14)
    y += 0.25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 30)
    return y * env(dur, a=0.0007, r=0.04)


def pluck(f, dur=0.6, bright=0.6, damp=0.996):
    """Karplus-Strong 拨弦（尤克里里/拨奏小提琴的感觉）。"""
    n = int(dur * SR)
    p = max(2, int(round(SR / f)))
    buf = lp(rng.uniform(-1, 1, p), 1500 + 8000 * bright, 1)
    y = np.zeros(n)
    y[:p] = buf
    for i in range(p, n):
        y[i] = damp * 0.5 * (y[i - p] + y[i - p + 1 if i - p + 1 < i else i - p])
    return y * env(dur, a=0.001, r=0.04)


def brass(f, dur, bright=0.7, vib=0.0):
    """卡通铜管：锯齿 + 跟着包络开合的低通（越响越亮）。"""
    t = t_axis(dur)
    fv = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.12) / 0.15, 0, 1))
    tone = osc(fv, dur, "saw")
    e = env(dur, a=0.025, r=min(0.12, dur * 0.4))
    out = np.zeros_like(tone)
    blk = 256
    zi = None
    for j in range(0, len(tone), blk):
        fc = 600 + (2200 + 3000 * bright) * e[j]
        sos = signal.butter(2, min(fc, SR * 0.45), fs=SR, output="sos")
        if zi is None: zi = np.zeros((sos.shape[0], 2))
        out[j:j + blk], zi = signal.sosfilt(sos, tone[j:j + blk], zi=zi)
    return out * e


def place(dst, src, at):
    i = int(at * SR)
    end = min(len(dst), i + len(src))
    dst[i:end] += src[: end - i]
    return dst


def room(x, wet=0.15, size=0.6):
    """很轻的 Schroeder 混响，给音效一点绘本里的温暖空间感。"""
    tail = int(0.5 * SR)
    y = np.concatenate([x, np.zeros(tail)])
    acc = np.zeros_like(y)
    for d_ms, g in [(29.7, 0.77), (37.1, 0.74), (41.1, 0.72), (43.7, 0.70)]:
        d = int(d_ms * size * SR / 1000 * 1.6)
        c = y.copy()
        for i in range(d, len(c), d):
            c[i:i + d] += g * c[i - d:i][: len(c[i:i + d])]
        acc += c
    for d_ms, g in [(5.0, 0.7), (1.7, 0.7)]:
        d = int(d_ms * SR / 1000)
        b = np.zeros(d + 1); b[0] = -g; b[-1] = 1
        a = np.zeros(d + 1); a[0] = 1; a[-1] = -g
        acc = signal.lfilter(b, a, acc)
    acc = lp(acc, 6000)
    out = y + wet * acc / 4
    # 去掉过长的静音尾巴
    e = np.abs(out)
    last = np.where(e > 1e-3 * e.max())[0][-1]
    out = out[: last + int(0.02 * SR)]
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return out


def formant_voice(f0_curve, dur, vowel="u", growl=0.0):
    """很简化的卡通“嗯？/哼”人声：锯齿波 + 共振峰带通。"""
    src = osc(f0_curve, dur, "saw")
    if growl:
        src *= 1 + growl * np.sin(2 * np.pi * 32 * t_axis(dur))
    F = {"u": [(320, 1), (800, 0.4), (2400, 0.1)],
         "o": [(450, 1), (850, 0.6), (2500, 0.1)],
         "m": [(280, 1), (1200, 0.15), (2500, 0.05)],
         "a": [(750, 1), (1200, 0.7), (2600, 0.2)]}[vowel]
    y = sum(g * bp(src, f * 0.85, f * 1.15) for f, g in F)
    return y


# ---------- 更像嘴说话的声音：声门脉冲 + 随时间变化的共振峰 ----------
VOWELS = {  # F1 F2 F3（成人），卡通小动物再整体乘 scale
    "a": (800, 1250, 2600), "o": (520, 900, 2500), "u": (360, 850, 2300), "e": (520, 1850, 2600),
    "i": (320, 2300, 3000), "m": (280, 1300, 2600), "n": (300, 1700, 2700), "w": (320, 700, 2300),
    "r": (420, 1300, 1700), "y": (300, 2200, 3000), "ə": (550, 1450, 2550),
}


def resonator_bank(x, tracks, bw=(90, 120, 170)):
    """x 经过三个共振峰（逐块更新系数的二阶谐振器，并联相加）。tracks: (n,3) 每个采样点的 F1..F3。"""
    n = len(x)
    out = np.zeros(n)
    blk = 64
    for k in range(3):
        zi = np.zeros(2)
        y = np.zeros(n)
        for j in range(0, n, blk):
            f = min(tracks[j, k], SR * 0.45)
            r = np.exp(-np.pi * bw[k] * (f / 1000) ** 0.3 / SR)
            w = 2 * np.pi * f / SR
            a = [1, -2 * r * np.cos(w), r * r]
            b = [(1 - r) * np.sqrt(1 - 2 * r * np.cos(2 * w) + r * r)]  # 每个共振峰的峰值增益都是 1
            seg = x[j:j + blk]
            y[j:j + len(seg)], zi = signal.lfilter(b, a, seg, zi=zi)
        out += y * (1.0, 0.85, 0.45)[k]
    return out


def vocal(f0, seq, dur, scale=1.0, breath=0.04, tilt=0.6, hpf=400):
    """
    卡通说话声。f0: 常数或数组；seq: [(时间秒, 音素)]，音素之间平滑过渡；scale: 共振峰缩放（>1 声道短、像小动物）。
    声源是限带锯齿 + 一点气声，频谱随 tilt 往高处衰减。最后切掉 hpf 以下：手机本来就放不出基频，
    耳朵会从谐波里自己“补”出音高（电话里的声音一样听得清）。
    """
    n = int(dur * SR)
    f = np.full(n, f0, float) if np.isscalar(f0) else np.asarray(f0, float)[:n]
    f = f * (1 + 0.006 * rng.standard_normal(n).cumsum() / np.sqrt(np.arange(1, n + 1)))  # 一点点抖动
    src = osc(f, dur, "saw")
    src = lp(src, 2500 + 4000 * (1 - tilt), 1) + breath * hp(noise(dur), 1500)
    tr = np.zeros((n, 3))
    times = [int(t * SR) for t, _ in seq] + [n]
    for i, (_, v) in enumerate(seq):
        a, b = times[i], times[i + 1]
        tr[a:b] = np.array(VOWELS[v]) * scale
    # 音素之间 30 ms 的滑动
    k = int(0.03 * SR)
    win = np.hanning(2 * k + 1); win /= win.sum()
    for c in range(3):
        tr[:, c] = np.convolve(np.pad(tr[:, c], k, mode="edge"), win, mode="valid")
    return hp(resonator_bank(src, tr), hpf, 4)


def burst(dur, lo, hi, decay=80):
    """辅音的气流爆破（p/t/k）或咔哒。"""
    return bp(noise(dur), lo, hi) * np.exp(-t_axis(dur) * decay)


def write(name, x, peak_db=-1.0):
    if ONLY and name not in ONLY:
        return
    x = np.asarray(x, float)
    x = hp(x - np.mean(x), 70)  # 70 Hz 以下全部切掉：手机放不出来，只会吃掉余量
    x = x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name:22s} {len(x)/SR:5.2f}s")


# =====================================================================================================
# 跳跃
# =====================================================================================================
def jump_charge():
    """按住蓄力：橡皮筋拉紧 + 音高慢慢升高（1.4s，松手时由游戏停止播放）。现在游戏用 tone() 实时合成，留作备用。"""
    dur = 1.4
    t = t_axis(dur)
    f = sweep(200, 620, dur)
    trem = 1 + 0.25 * np.sin(2 * np.pi * (8 + 10 * t / dur) * t)
    tone = (0.7 * osc(f, dur, "tri") + 0.3 * osc(f * 2, dur, "sine")) * trem
    tone = lp(tone, 2500)
    creak = np.zeros_like(t)
    tt = 0.05
    while tt < dur - 0.05:
        g = bp(noise(0.012), 1800, 4200) * np.hanning(int(0.012 * SR))
        place(creak, g * (0.3 + 0.7 * tt / dur), tt)
        tt += 0.09 - 0.06 * tt / dur
    y = tone * env(dur, a=0.15, r=0.05) * (0.4 + 0.6 * t / dur) + 0.35 * creak
    write("jump_charge", y, -4)


def jump_charge_max():
    """蓄力到满：一声清脆的小铃（A6 + E7，和任何一章的音乐都不打架）。"""
    y = room(bell(NOTE["A6"], 0.5) + 0.5 * bell(NOTE["E7"], 0.5), wet=0.2)
    write("jump_charge_max", y, -6)


def jump_release():
    """
    弹弓松手起跳（全游戏最常响的声音）：先一声亮的 '咻'（2–6 kHz），再一个 300→900 Hz 的卡通弹簧 'boing'。
    以前的版本 98% 能量在 500 Hz 以下，手机上几乎听不见。
    """
    dur = 0.42
    t = t_axis(dur)
    thwip = sweep_bp(noise(0.07), 2200, 5200, q=1.6) * np.linspace(1, 0, int(0.07 * SR)) ** 1.5
    base = sweep(330, 900, 0.22)
    base = np.concatenate([base, np.full(int(dur * SR) - len(base), 900.0)])
    wob = 1 + 0.12 * np.sin(2 * np.pi * 18 * t) * np.exp(-t * 9)
    boing = 0.75 * osc(base * wob, dur, "tri") + 0.3 * osc(base * wob * 2, dur, "sine")
    boing = lp(boing * env(dur, a=0.003, decay=9, r=0.05), 5000)
    y = np.zeros(int(dur * SR))
    place(y, 0.8 * thwip, 0)
    place(y, boing, 0.012)
    write("jump_release", room(y, 0.1), -2)


def jump_whoosh():
    """空中的风声（可选，跳得远时叠加）。"""
    dur = 0.45
    n = noise(dur)
    t = t_axis(dur)
    fc = 500 + 2200 * np.sin(np.pi * t / dur) ** 2
    out = np.zeros_like(n)
    blk = 256
    for i in range(0, len(n), blk):
        c = fc[i]
        out[i:i + blk] = bp(n[max(0, i - 2048):i + blk], c * 0.6, c * 1.4)[-len(n[i:i + blk]):]
    y = out * np.sin(np.pi * t / dur) ** 1.5
    write("jump_whoosh", y, -8)


def aim_predict():
    """瞄准 2 秒后出现预测轨迹：一串轻轻的叮（E6 A6 B6 E7）。"""
    notes = ["E6", "A6", "B6", "E7"]
    y = np.zeros(int(0.9 * SR))
    for i, n in enumerate(notes):
        place(y, kalimba(NOTE[n], 0.5) * (0.6 + 0.1 * i), i * 0.05)
    write("aim_predict", room(y, 0.25), -8)


def land_bloop():
    """落地回弹的小 '啵'（叠在落地音效上，给柔软弹性感）。基频提到 900→380 Hz，手机上也听得见。"""
    dur = 0.14
    f = sweep(900, 380, dur)
    y = (osc(f, dur, "sine") + 0.25 * osc(f * 2, dur, "sine")) * env(dur, a=0.002, decay=20, r=0.02)
    write("land_bloop", y, -4)


def tongue_thwip():
    """舌头弹出去：很快的上扬 '咻' + 橡皮筋 twang（600→1300 Hz）。play.ts 吐舌头时用（代替 jump_release ×1.9）。"""
    dur = 0.2
    y = np.zeros(int(dur * SR))
    sw = sweep_bp(noise(0.06), 1500, 6500, q=2.2) * np.linspace(1, 0, int(0.06 * SR))
    place(y, 0.7 * sw, 0)
    f = sweep(600, 1300, 0.15)
    tw = (osc(f, 0.15, "tri") + 0.3 * osc(2 * f, 0.15, "sine")) * env(0.15, a=0.002, decay=22, r=0.02)
    place(y, 0.8 * tw, 0.01)
    write("tongue_thwip", y, -3)


def slurp():
    """舌头卷着东西缩回来：'嘶溜——啵'。共振的带通从 2.6 kHz 滑到 700 Hz，带一点咕噜的湿感，最后一个小啵。"""
    dur = 0.42
    t = t_axis(0.32)
    wet = sweep_bp(noise(0.32), 2600, 700, q=5) * (1 + 0.5 * np.sin(2 * np.pi * 38 * t))
    wet *= np.sin(np.pi * np.clip(t / 0.32, 0, 1)) ** 0.7
    y = np.zeros(int(dur * SR))
    place(y, wet, 0)
    pop = osc(sweep(520, 1100, 0.06), 0.06, "sine") * env(0.06, a=0.001, decay=50, r=0.01)
    place(y, 0.9 * pop, 0.31)
    write("slurp", y, -3)


def perfect_sparkle():
    """完美落点/漂亮的一跳：一串很快的钟琴（E6 A6 B6 E7）加闪光。"""
    y = np.zeros(int(0.9 * SR))
    for i, n in enumerate(["E6", "A6", "B6", "E7"]):
        place(y, glock(NOTE[n], 0.6) * (0.7 + 0.1 * i), i * 0.045)
    sh = bp(noise(0.6), 6000, 11000) * env(0.6, a=0.05, decay=6, r=0.1) * 0.12
    place(y, sh, 0.1)
    write("perfect_sparkle", room(y, 0.25), -4)


# =====================================================================================================
# 落水 / 游泳
# =====================================================================================================
def fall_whistle():
    """失足落水前的滑哨（卡通下坠音）。"""
    dur = 0.55
    t = t_axis(dur)
    f = sweep(1500, 380, dur) * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
    y = osc(f, dur, "sine") + 0.15 * osc(f * 2, dur, "sine")
    y += 0.05 * bp(noise(dur), 800, 3000)
    write("fall_whistle", y * env(dur, a=0.03, r=0.08), -6)


def swim_climb():
    """游上岸：三个向上冒的泡泡 + 一声轻快的 '啵'（A5）。"""
    y = np.zeros(int(0.6 * SR))
    for i, (f0, f1) in enumerate([(380, 800), (460, 1000), (560, 1250)]):
        d = 0.07
        b = osc(sweep(f0, f1, d), d, "sine") * env(d, a=0.002, decay=20, r=0.01)
        place(y, b * (0.7 + 0.15 * i), i * 0.08)
    place(y, marimba(NOTE["A5"], 0.3) * 0.6, 0.27)
    write("swim_climb", room(y, 0.15), -3)


def swim_panic():
    """落水后的咕噜水泡（循环，4 秒，泡泡位置随机，不再每秒重复同一个节奏）。首尾接得上：尾巴绕回开头。"""
    dur = 4.0
    n = int(dur * SR)
    y = np.zeros(n + int(0.2 * SR))
    tt = 0.0
    while tt < dur:
        d = 0.035 + 0.04 * rng.random()
        f0 = 300 + 400 * rng.random()
        b = osc(sweep(f0, f0 * (1.8 + rng.random()), d), d, "sine") * env(d, a=0.002, decay=30, r=0.008)
        place(y, b * (0.35 + 0.65 * rng.random()), tt)
        tt += 0.04 + 0.11 * rng.random() ** 1.5
    y[:len(y) - n] += y[n:]
    y = y[:n]
    write("swim_bubbles", y, -10)


# =====================================================================================================
# 车辆
# =====================================================================================================
def engine(f0, dur, harm_lo=350, harm_hi=1800, putt=0.5):
    """卡通小货车的发动机：低基频的脉冲串，但能量放在 350–1800 Hz 的谐波上（手机听得见），带点“突突”的起伏。"""
    t = t_axis(dur)
    f = np.full(len(t), f0, float) if np.isscalar(f0) else f0[:len(t)]
    ph = np.cumsum(f) / SR
    pulse = np.zeros(len(t))
    for k in range(1, 40):
        pulse += np.sin(2 * np.pi * k * ph) * (k * f < SR / 2.2) * (1 / k ** 0.4)
    body = bp(pulse, harm_lo, harm_hi, 2) + 0.25 * lp(pulse, 300)
    am = 1 + putt * np.sin(2 * np.pi * np.cumsum(f / 2) / SR)
    return body * am


def truck_slowdown():
    """青蛙回到车上、车辆减速：发动机降调 + 一声气刹 '噗嘶'。"""
    dur = 0.9
    y = engine(sweep(95, 55, dur), dur) * env(dur, a=0.02, r=0.25) * np.linspace(1, 0.5, int(dur * SR))
    pssh = bp(noise(0.4), 2500, 7500) * env(0.4, a=0.008, decay=7, r=0.08)
    place(y, 0.35 * pssh / (np.abs(pssh).max() + 1e-9) * np.abs(y).max(), 0.32)
    write("truck_slowdown", y, -4)


def truck_speedup():
    """再次起跳后车辆恢复速度：发动机升调，带一点涡轮的 '呜—'。"""
    dur = 0.8
    y = engine(sweep(55, 120, dur), dur, putt=0.6) * env(dur, a=0.04, r=0.25)
    whine = osc(sweep(900, 1700, dur), dur, "sine") * env(dur, a=0.2, r=0.3) * 0.08
    write("truck_speedup", y / np.abs(y).max() + whine, -4)


def exhaust_puff():
    """排气管冒黑烟、呛了青蛙一下：'噗——噗噗'，两三团带低音冲击的气流（中频为主）。"""
    dur = 0.75
    y = np.zeros(int(dur * SR))
    for at, g, d in [(0.0, 1.0, 0.3), (0.32, 0.6, 0.16), (0.48, 0.45, 0.14)]:
        puff = lp(noise(d), 2400) * env(d, a=0.004, decay=10, r=0.03)
        thump = osc(sweep(260, 110, d), d, "sine") * env(d, a=0.002, decay=25, r=0.02)
        place(y, g * (puff + 0.6 * thump), at)
    write("exhaust_puff", y, -3)


# =====================================================================================================
# 订单与居民
# =====================================================================================================
def deliver_happy():
    """居民开心签收：木琴上行 A5–D6–E6–A6（1-4-5-1，一听就是“完成了”）。"""
    y = np.zeros(int(0.9 * SR))
    for i, n in enumerate(["A5", "D6", "E6", "A6"]):
        place(y, marimba(NOTE[n], 0.5), i * 0.07)
    write("deliver_happy", room(y, 0.18), -2)


def deliver_confused():
    """居民疑惑（送错/没买）：卡通 '嗯？' 往上挑，基频 380→560 Hz，再加一个木鱼 E5。"""
    dur = 0.45
    f0 = sweep(380, 560, dur, "lin")
    y = vocal(f0, [(0, "n"), (0.12, "e")], dur, scale=1.15) * env(dur, a=0.03, r=0.1)
    y /= np.abs(y).max()
    place(y, 0.3 * marimba(NOTE["E5"], 0.4), 0)
    write("deliver_confused", y, -3)


def deliver_unhappy():
    """居民不满：'哼～' 往下掉，基频 480→340 Hz，带一点鼻音和颤。"""
    dur = 0.5
    t = t_axis(dur)
    f0 = sweep(480, 340, dur) * (1 + 0.03 * np.sin(2 * np.pi * 26 * t))
    y = vocal(f0, [(0, "n"), (0.08, "ə"), (0.3, "n")], dur, scale=1.15) * env(dur, a=0.015, r=0.12)
    y /= np.abs(y).max()
    place(y, 0.25 * burst(0.05, 600, 2400, 60), 0)
    write("deliver_unhappy", y, -3)


def coin():
    """获得金币/小费：经典两音 '叮叮'（B6、E7）。"""
    y = np.zeros(int(0.6 * SR))
    place(y, bell(NOTE["B6"], 0.3) * 0.7, 0)
    place(y, bell(NOTE["E7"], 0.5), 0.07)
    write("coin", room(y, 0.12), -4)


def coin_loss():
    """扣钱（救命绳 −5 金币、罚款）：三枚硬币往下掉的叮——叮——叮（E7 B6 E6），越来越轻。"""
    y = np.zeros(int(0.9 * SR))
    for i, n in enumerate(["E7", "B6", "E6"]):
        place(y, bell(NOTE[n], 0.4) * (1 - 0.22 * i), i * 0.11)
    place(y, 0.15 * burst(0.03, 3000, 8000, 120), 0)
    write("coin_loss", room(y, 0.15), -4)


def cash_register():
    """货到付款收款：'咔-叮'（D7 + A7）。"""
    y = np.zeros(int(0.9 * SR))
    click = hp(noise(0.03), 2000) * np.linspace(1, 0, int(0.03 * SR)) ** 3
    place(y, 0.5 * click, 0)
    place(y, 0.5 * click, 0.06)
    place(y, bell(NOTE["D7"], 0.7) + 0.6 * bell(NOTE["A7"], 0.7), 0.1)
    write("cash_register", room(y, 0.12), -3)


def urgent_alert():
    """新加急订单 / 加急快超时：两组急促的木琴双音 E6 / A6。"""
    y = np.zeros(int(0.8 * SR))
    for k, at in enumerate([0, 0.11, 0.3, 0.41]):
        place(y, marimba(NOTE["E6"] if k % 2 == 0 else NOTE["A6"], 0.25, bright=1.4), at)
    write("urgent_alert", y, -3)


def urgent_tick():
    """加急倒计时的一声 '嘀嗒'（单发；play.ts 按剩余时间从 1 Hz 加快到 4 Hz、音高随 rate 升高）。"""
    dur = 0.09
    y = (osc(NOTE["E6"], dur, "sine") + 0.4 * osc(NOTE["E7"], dur, "sine")) * env(dur, a=0.001, decay=55, r=0.01)
    place(y, 0.6 * burst(0.008, 3000, 9000, 400), 0)
    write("urgent_tick", y, -3)


def urgent_fail():
    """加急超时：铜管 '嘣——呜'，E5 往下滑到 E4（中频，手机能听见）。"""
    dur = 0.6
    f = np.concatenate([np.full(int(0.12 * SR), NOTE["E5"]), sweep(NOTE["E5"], NOTE["E4"], dur - 0.12)])
    y = brass(f, dur, bright=0.5)
    write("urgent_late", room(y, 0.12), -3)


def bag_full():
    """背包满了/太重：先一声木头 '笃'（800 Hz），再一个 520→390 Hz 的 '嗯-嗯'（不行哦）。"""
    y = np.zeros(int(0.42 * SR))
    place(y, osc(820, 0.08, "sine") * env(0.08, a=0.001, decay=55, r=0.01), 0)
    place(y, 0.5 * osc(2150, 0.05, "sine") * env(0.05, a=0.001, decay=90, r=0.01), 0)
    place(y, 0.4 * burst(0.02, 1000, 4000, 200), 0)
    for at, f, d in [(0.07, 520, 0.11), (0.2, 390, 0.16)]:
        v = vocal(f, [(0, "n"), (0.025, "ə")], d, scale=1.15) * env(d, a=0.01, r=0.04)
        place(y, 0.9 * v / np.abs(v).max(), at)
    write("bag_full", y, -3)


def parcel_pickup_pop():
    """领包裹叠在纸箱声上的 '啪'：纸板拍打的中频（400–1600 Hz）。"""
    dur = 0.12
    y = bp(noise(dur), 400, 1600) * env(dur, a=0.001, decay=45, r=0.02)
    y += 0.6 * osc(sweep(700, 420, dur), dur, "sine") * env(dur, a=0.001, decay=40, r=0.02)
    write("pickup_pop", y, -2)


def stamp_chk():
    """盖章的墨印 '咔'：1–3 kHz 的短促摩擦 + 一点 600 Hz 的木头感，叠在原来的盖章声上。"""
    dur = 0.1
    y = bp(noise(dur), 1000, 3200) * env(dur, a=0.0007, decay=60, r=0.01)
    y += 0.7 * osc(620, dur, "sine") * env(dur, a=0.001, decay=50, r=0.01)
    write("stamp_chk", y, -2)


def aww_missed():
    """包裹没送到、房子过去了：三个人一起 '哎——' 往下（失望但可爱）。"""
    dur = 0.75
    y = np.zeros(int(dur * SR))
    for k, (d, sc) in enumerate([(1.0, 1.1), (1.06, 1.2), (0.95, 1.0)]):
        f0 = sweep(440 * d, 320 * d, dur)
        v = vocal(f0, [(0, "a"), (0.35, "o")], dur, scale=sc) * env(dur, a=0.05, r=0.2)
        place(y, v / np.abs(v).max() * (0.8 if k else 1), 0.012 * k)
    write("aww_missed", room(y, 0.15), -3)


# =====================================================================================================
# 危险区 / 提示
# =====================================================================================================
def warn_pulse():
    """
    红线危险区的心跳 '咚-咚'（每次一下，play.ts 按掉到线下多深从 2 Hz 加快、rate 升高）。
    身体在 300 Hz 附近、带 1 kHz 的 '嗒'，手机外放也听得到。
    """
    dur = 0.36
    y = np.zeros(int(dur * SR))
    for at, f, g in [(0.0, 400, 1.0), (0.15, 330, 0.75)]:
        d = 0.18
        body = osc(sweep(f * 1.3, f, d), d, "sine") + 0.45 * osc(sweep(f * 2.6, f * 2, d), d, "sine")
        body *= env(d, a=0.002, decay=22, r=0.02)
        tap = bp(noise(0.02), 800, 2500) * np.exp(-t_axis(0.02) * 200)
        place(y, g * body, at)
        place(y, g * 0.35 * tap, at)
    write("warn_pulse", y, -3)


def warn_pop():
    """刚掉进危险区：青蛙一声 '哇哦！'（升—降）。"""
    dur = 0.42
    f0 = np.concatenate([sweep(420, 620, 0.16), sweep(620, 380, dur - 0.16)])
    y = vocal(f0, [(0, "w"), (0.04, "a"), (0.2, "o"), (0.33, "u")], dur, scale=1.35) * env(dur, a=0.01, r=0.08)
    write("warn_pop", y, -3)


def hint_pop():
    """提示气泡冒出来：'啵' + 一个轻轻的 E6。"""
    y = np.zeros(int(0.4 * SR))
    pop = osc(sweep(600, 1400, 0.045), 0.045, "sine") * env(0.045, a=0.001, decay=40, r=0.01)
    place(y, pop, 0)
    place(y, 0.5 * kalimba(NOTE["E6"], 0.35), 0.03)
    write("hint_pop", room(y, 0.15), -4)


def toast_blip():
    """小字条/吐司提示：两个很短的 '哔哔'（A6、E7），轻。"""
    y = np.zeros(int(0.2 * SR))
    for at, n in [(0, "A6"), (0.06, "E7")]:
        d = 0.06
        place(y, osc(NOTE[n], d, "sine") * env(d, a=0.002, decay=40, r=0.01), at)
    write("toast_blip", y, -5)


# =====================================================================================================
# 套索 / 救命绳
# =====================================================================================================
def lasso_whirl():
    """套索在头顶甩圈：三次 '呼—呼—呼' 的风声，越甩越快。"""
    dur = 1.0
    y = np.zeros(int(dur * SR))
    at = 0.0
    for k in range(4):
        d = 0.26 - 0.03 * k
        w = sweep_bp(noise(d), 500 + 150 * k, 1800 + 300 * k, q=1.5) * np.sin(np.pi * t_axis(d) / d) ** 2
        place(y, w * (0.6 + 0.13 * k), at)
        at += d * 0.85
    write("lasso_whirl", y, -4)


def rope_snap():
    """绳子一下绷紧：低一点的拨弦 '嘣'（A3，泛音丰富）+ 一声 '啪'。"""
    y = np.zeros(int(0.5 * SR))
    place(y, pluck(NOTE["A3"], 0.45, bright=0.9, damp=0.993), 0.006)
    place(y, 0.8 * burst(0.03, 1200, 6000, 140), 0)
    write("rope_snap", y, -3)


# =====================================================================================================
# 总部 / 结算 / 奖励（G 小调、降 B 大调 = 总部音乐的调；或只用 D、A 两个音的空五度，哪里都和谐）
# =====================================================================================================
def upgrade():
    """购买装备升级：上行闪光琶音 E5 A5 B5 E6 A6 B6（福利社音乐里也和谐）。"""
    y = np.zeros(int(1.4 * SR))
    for i, n in enumerate(["E5", "A5", "B5", "E6", "A6", "B6"]):
        place(y, kalimba(NOTE[n], 0.7) * (0.6 + 0.08 * i), i * 0.06)
    shimmer = bp(noise(1.0), 5000, 9000) * env(1.0, a=0.3, decay=2, r=0.3) * 0.08
    place(y, shimmer, 0.3)
    write("upgrade", room(y, 0.25), -2)


def rating_good():
    """评级揭晓（好）：拨弦 降B大调琶音 Bb4 D5 F5 Bb5，最后钟琴点一下。"""
    y = np.zeros(int(1.3 * SR))
    for i, n in enumerate(["Bb4", "D5", "F5", "Bb5"]):
        place(y, pluck(NOTE[n], 0.7, bright=0.7) * (0.75 + 0.08 * i), i * 0.09)
    place(y, 0.35 * glock(NOTE["Bb6"], 0.6), 0.27)
    write("rating_good", room(y, 0.2), -2)


def rating_bad():
    """评级揭晓（差）：拨弦 G 小调慢慢往下 D5 Bb4 G4，最后一个闷闷的低音，可爱的“唉”。"""
    y = np.zeros(int(1.3 * SR))
    for i, (n, at) in enumerate([("D5", 0), ("Bb4", 0.18), ("G4", 0.4)]):
        place(y, pluck(NOTE[n], 0.8, bright=0.45, damp=0.994) * (1 - 0.1 * i), at)
    place(y, 0.5 * pluck(NOTE["G3"], 0.8, bright=0.3, damp=0.993), 0.4)
    write("rating_bad", room(y, 0.2), -2)


def achievement():
    """成就达成：两声钟（D6 + A6 空五度，哪一首音乐下都和谐）+ 往上的闪光。"""
    y = np.zeros(int(1.5 * SR))
    place(y, bell(NOTE["D6"], 1.2) + 0.7 * bell(NOTE["A6"], 1.2), 0)
    place(y, 0.8 * (bell(NOTE["A6"], 1.0) + 0.6 * bell(NOTE["D7"], 1.0)), 0.16)
    for i, n in enumerate(["D7", "E7", "A7"]):
        place(y, 0.22 * glock(NOTE[n], 0.4), 0.3 + 0.05 * i)
    sh = bp(noise(0.9), 6000, 11000) * env(0.9, a=0.1, decay=4, r=0.2) * 0.1
    place(y, sh, 0.2)
    write("achievement", room(y, 0.25), -2)


def rank_up():
    """升职：两秒的小号角（降B大调：Bb4 D5 F5 → Bb5 长音）+ 定音鼓 + 闪光。和成就的钟声、装备升级的琶音都不一样。"""
    y = np.zeros(int(2.4 * SR))
    for n, at, d in [("Bb4", 0.0, 0.14), ("D5", 0.15, 0.14), ("F5", 0.3, 0.14), ("Bb5", 0.46, 1.2)]:
        place(y, brass(NOTE[n], d, bright=0.8, vib=0.012 if d > 1 else 0), at)
        place(y, 0.5 * brass(NOTE[n] / 2, d, bright=0.4), at)
    for at in [0.0, 0.46]:
        dur = 0.5
        tim = osc(sweep(NOTE["Bb2"] * 1.2, NOTE["Bb2"], dur), dur, "sine") + 0.5 * osc(NOTE["Bb3"] * 1.5, dur, "sine")
        place(y, 0.6 * tim * env(dur, a=0.002, decay=7, r=0.05), at)
    for i, n in enumerate(["Bb6", "D7", "F7", "Bb7"]):
        place(y, 0.18 * glock(NOTE[n], 0.5), 0.5 + 0.06 * i)
    write("rank_up", room(y, 0.3), -2)


def chapter_clear():
    """一章通关（第 5、10…天过关）：比升职更长一点的进行曲尾巴，降B大调，拨弦 + 铜管 + 钟琴。"""
    y = np.zeros(int(2.8 * SR))
    mel = [("F5", 0.0, 0.12), ("Bb5", 0.14, 0.12), ("D6", 0.28, 0.12), ("C6", 0.46, 0.12), ("D6", 0.6, 0.12), ("F6", 0.78, 1.3)]
    for n, at, d in mel:
        place(y, 0.8 * brass(NOTE[n], d, bright=0.7, vib=0.01 if d > 1 else 0), at)
    for n, at in [("Bb3", 0.0), ("F4", 0.28), ("Bb3", 0.6), ("D4", 0.78), ("F4", 0.78), ("Bb4", 0.78)]:
        place(y, 0.45 * pluck(NOTE[n], 0.9, bright=0.6), at)
    for i, n in enumerate(["Bb6", "D7", "F7", "Bb7", "D8"]):
        place(y, 0.15 * glock(NOTE[n], 0.5), 0.8 + 0.05 * i)
    write("chapter_clear", room(y, 0.3), -2)


def day_start():
    """出发！（关卡介绍卡关掉）：拨弦 A4+E5 → A5+E6 的 '嗒-哒' + 刷子鼓，哪一章的音乐都配得上。"""
    y = np.zeros(int(1.2 * SR))
    for at, notes in [(0.0, ["A4", "E5"]), (0.16, ["A5", "E6"])]:
        for n in notes:
            place(y, 0.6 * pluck(NOTE[n], 0.8, bright=0.75), at)
    for at in [0.0, 0.16]:
        place(y, 0.35 * hp(noise(0.12), 3000) * env(0.12, a=0.002, decay=30, r=0.02), at)
    place(y, 0.3 * glock(NOTE["A6"], 0.6), 0.16)
    write("day_start", room(y, 0.2), -2)


def map_unlock():
    """路线图上新的一天解锁：'刷' 一下 + 钟琴 A5 B5 E6 A6 往上。"""
    y = np.zeros(int(1.2 * SR))
    sw = sweep_bp(noise(0.35), 800, 6000, q=1.2) * np.sin(np.pi * t_axis(0.35) / 0.35) ** 2
    place(y, 0.4 * sw, 0)
    for i, n in enumerate(["A5", "B5", "E6", "A6"]):
        place(y, glock(NOTE[n], 0.7) * (0.7 + 0.1 * i), 0.18 + i * 0.07)
    write("map_unlock", room(y, 0.25), -3)


def sad_trombone():
    """被甩出屏幕/当天失败：卡通 '哇哇哇哇～'。"""
    notes = [(311, 0.32), (294, 0.32), (277, 0.32), (262, 1.0)]
    y = np.zeros(int(2.2 * SR))
    at = 0
    for i, (f, d) in enumerate(notes):
        t = t_axis(d)
        vib = 1 + (0.025 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1) if i == 3 else 0)
        tone = osc(f * vib, d, "saw")
        e = env(d, a=0.03, r=0.12)
        out = np.zeros_like(tone)
        blk = 512
        for j in range(0, len(tone), blk):
            fc = 700 + 2600 * e[j]
            out[j:j + blk] = lp(tone[max(0, j - 2048):j + blk], fc)[-len(tone[j:j + blk]):]
        place(y, out * e, at)
        at += d * 0.95
    write("day_fail", hp(room(y, 0.15), 180, 2), -2)


# =====================================================================================================
# 界面 / 家 / 福利社
# =====================================================================================================
def gift_open():
    """拆礼物：包装纸沙沙两下 + 丝带 '嗖' + 一点闪光（A6 E7）。"""
    y = np.zeros(int(1.0 * SR))
    for at, d in [(0.0, 0.14), (0.12, 0.18)]:
        g = np.zeros(int(d * SR))
        k = 0.0
        while k < d - 0.01:
            place(g, bp(noise(0.008), 2500, 8000) * np.hanning(int(0.008 * SR)) * rng.uniform(0.4, 1), k)
            k += rng.uniform(0.002, 0.008)
        place(y, g * np.sin(np.pi * t_axis(d) / d), at)
    place(y, 0.5 * sweep_bp(noise(0.12), 1500, 5000, q=3) * np.linspace(1, 0, int(0.12 * SR)), 0.3)
    place(y, 0.5 * glock(NOTE["A6"], 0.5), 0.4)
    place(y, 0.4 * glock(NOTE["E7"], 0.5), 0.46)
    write("gift_open", room(y, 0.2), -3)


def letter_open():
    """拆信：信封纸滑出来的 '刷' + 折页 '啪'。"""
    y = np.zeros(int(0.5 * SR))
    slide = bp(noise(0.25), 3000, 9000) * np.sin(np.pi * t_axis(0.25) / 0.25) ** 1.5
    place(y, 0.7 * slide, 0)
    flap = bp(noise(0.05), 1200, 5000) * np.exp(-t_axis(0.05) * 90)
    flap += 0.5 * osc(sweep(900, 500, 0.05), 0.05, "sine") * env(0.05, a=0.001, decay=60, r=0.01)
    place(y, flap, 0.26)
    write("letter_open", y, -4)


def frame_tap():
    """相框挂上墙：木头 '笃' + 钉子轻轻 '叮'。"""
    y = np.zeros(int(0.3 * SR))
    t = t_axis(0.2)
    wood = np.sin(2 * np.pi * 900 * t) * np.exp(-t * 40) + 0.5 * np.sin(2 * np.pi * 2350 * t) * np.exp(-t * 70)
    place(y, wood, 0)
    place(y, 0.3 * burst(0.015, 1500, 5000, 250), 0)
    place(y, 0.25 * bell(NOTE["E7"], 0.25), 0.02)
    write("frame_tap", y, -3)


def tab_switch():
    """切换标签：很短的纸片 '嗒' + 一个小 '叮'（E6）。"""
    y = np.zeros(int(0.12 * SR))
    place(y, bp(noise(0.012), 2000, 6000) * np.hanning(int(0.012 * SR)), 0)
    place(y, 0.5 * osc(NOTE["E6"], 0.07, "sine") * env(0.07, a=0.001, decay=50, r=0.01), 0.005)
    write("tab_switch", y, -6)


def purchase():
    """福利社买东西：'咔嚓' 两下 + 收银铃（E7 + B7）+ 一把硬币叮叮当当。和到付的 cash_register 不一样。"""
    y = np.zeros(int(1.0 * SR))
    click = hp(noise(0.025), 2500) * np.linspace(1, 0, int(0.025 * SR)) ** 3
    place(y, 0.5 * click, 0)
    place(y, 0.4 * click, 0.05)
    place(y, 0.8 * (bell(NOTE["E7"], 0.6) + 0.5 * bell(NOTE["B7"], 0.6)), 0.08)
    for k in range(6):
        f = rng.choice([NOTE["E7"], NOTE["A7"], NOTE["B7"], NOTE["D7"]]) * rng.uniform(0.99, 1.01)
        place(y, 0.18 * bell(f, 0.25), 0.25 + 0.04 * k + rng.uniform(0, 0.02))
    write("purchase", room(y, 0.15), -3)


def equip():
    """戴上帽子/围巾：布料 '唰' + 一个可爱的 '啵'（500→900 Hz）。"""
    y = np.zeros(int(0.4 * SR))
    sw = bp(noise(0.2), 1000, 4500) * np.sin(np.pi * t_axis(0.2) / 0.2) ** 2
    place(y, 0.6 * sw, 0)
    pop = osc(sweep(500, 900, 0.07), 0.07, "sine") * env(0.07, a=0.002, decay=30, r=0.01)
    place(y, pop, 0.17)
    write("equip", y, -4)


# =====================================================================================================
# 天气和环境的单发声音（环境声循环里随机出现，也可以单独播）
# =====================================================================================================
def gust():
    """一阵风：2.4 秒，中心频率 400→1200→600 Hz 的气流，带一点点口哨。"""
    dur = 2.4
    t = t_axis(dur)
    n = noise(dur)
    shape = np.sin(np.pi * t / dur) ** 2
    a = sweep_bp(n[: len(n) // 2], 400, 1200, q=1.2)
    b = sweep_bp(n[len(n) // 2:], 1200, 600, q=1.2)
    y = np.concatenate([a, b]) * shape
    y += 0.05 * osc(sweep(900, 1300, dur), dur, "sine") * shape ** 2
    write("gust", y, -4)


def thunder():
    """雷声：一声 '咔嚓'（中高频，手机听得见）+ 滚动的隆隆声（几团衰减的低频噪声）。"""
    dur = 3.6
    y = np.zeros(int(dur * SR))
    crack = bp(noise(0.25), 800, 5000) * np.exp(-t_axis(0.25) * 18)
    place(y, 0.9 * crack, 0.05)
    for at, g, d in [(0.0, 1.0, 1.6), (0.5, 0.7, 1.8), (1.2, 0.6, 2.2), (2.0, 0.4, 1.5)]:
        d = min(d, dur - at)
        r = lp(noise(d), 350, 2) + 0.25 * bp(noise(d), 300, 900)
        place(y, g * r * env(d, a=0.08, decay=1.6, r=0.3) * 3, at)
    write("thunder", y, -2)


def gull():
    """海鸥：两三声沙哑的 '啊——啊'（1.1 kHz 往下滑，谐波丰富）。"""
    y = np.zeros(int(1.3 * SR))
    for at, d, f0 in [(0.0, 0.32, 1250), (0.36, 0.28, 1150), (0.68, 0.45, 1050)]:
        t = t_axis(d)
        f = sweep(f0, f0 * 0.7, d) * (1 + 0.04 * np.sin(2 * np.pi * 30 * t))
        v = osc(f, d, "saw") * (1 + 0.4 * np.sin(2 * np.pi * 55 * t))
        v = bp(v, 900, 4500) * env(d, a=0.02, r=0.08)
        place(y, v, at)
    write("gull", room(y, 0.2, 0.9), -4)


def firecracker():
    """一串鞭炮：二十来声 '噼啪'，每声是很尖的爆破 + 一点低音，间隔随机。"""
    dur = 2.0
    y = np.zeros(int(dur * SR))
    at = 0.0
    while at < dur - 0.15:
        d = rng.uniform(0.01, 0.02)
        pop = bp(noise(d), 1200, 7000) * np.exp(-t_axis(d) * rng.uniform(150, 300))
        pop += 0.4 * osc(rng.uniform(180, 300), d, "sine") * np.exp(-t_axis(d) * 120)
        place(y, pop * rng.uniform(0.4, 1.0), at)
        at += rng.uniform(0.03, 0.12)
    write("firecracker", room(y, 0.2, 0.9), -2)


def ice_crack():
    """冰裂：一声尖的 '咔' 加上冰面特有的 '啾——' 下滑（4 kHz → 300 Hz 的色散啁啾）。"""
    dur = 0.7
    y = np.zeros(int(dur * SR))
    place(y, 0.7 * burst(0.02, 2000, 8000, 200), 0)
    d = 0.22
    ch = osc(sweep(4200, 300, d), d, "sine") * env(d, a=0.001, decay=12, r=0.03)
    place(y, 0.8 * ch, 0.005)
    for k in range(5):
        place(y, 0.3 * burst(0.01, 1500, 6000, 300) * rng.uniform(0.3, 1), 0.05 + rng.uniform(0, 0.35))
    write("ice_crack", room(y, 0.25, 0.9), -3)


def leaf_rustle():
    """落叶沙沙：干叶子在地上翻动，颗粒感的高频噪声，先密后疏。"""
    dur = 1.2
    y = np.zeros(int(dur * SR))
    k = 0.0
    while k < dur - 0.02:
        g = bp(noise(0.012), 2000, 8000) * np.hanning(int(0.012 * SR))
        dens = np.sin(np.pi * k / dur)
        place(y, g * rng.uniform(0.2, 1.0) * dens, k)
        k += rng.uniform(0.003, 0.02) / max(0.2, dens)
    write("leaf_rustle", y, -5)


# =====================================================================================================
# 角色说话（"动物语"：几个短音节，游戏里按物种调 playbackRate 变成不同的声音）
# =====================================================================================================
SYLLABLES = {
    # 圆润的普通声音：大部分居民
    "soft": [("p", "a"), ("t", "e"), ("w", "a"), ("b", "o"), ("n", "e")],
    # 鸭子、鹅、鹈鹕、天鹅、白鹭：扁扁的鼻音嘴
    "beak": [("k", "a"), ("w", "a"), ("k", "e"), ("h", "o")],
    # 螃蟹：咔哒 + 很短的音
    "click": [("t", "i"), ("k", "a"), ("t", "e")],
    # 绵羊：带颤音的咩
    "bleat": [("m", "e"), ("b", "e"), ("m", "a")],
}
BURST = {"p": (500, 1500), "b": (300, 1000), "t": (3000, 7000), "k": (1500, 3500), "h": (800, 4000)}


def syllable(cons, vow, f0=330, dur=0.13, scale=1.25, kind="soft"):
    t = t_axis(dur)
    lilt = 1 + 0.08 * np.sin(np.pi * t / dur)
    f = f0 * lilt
    if kind == "bleat":
        f = f * (1 + 0.06 * np.sin(2 * np.pi * 24 * t))
    seq = [(0, cons if cons in VOWELS else "ə"), (0.025, vow)] if cons in VOWELS else [(0, vow)]
    y = vocal(f, seq, dur, scale=scale * (1.15 if kind == "beak" else 1.0), tilt=0.45 if kind == "beak" else 0.6)
    if kind == "beak":
        y = y + 0.35 * bp(y, 1500, 3500)  # 更扁、更“鼻”
    y = y / (np.abs(y).max() + 1e-9) * env(dur, a=0.012, r=0.04)
    if cons in BURST:
        lo, hi = BURST[cons]
        y[: int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
        b = burst(0.02, lo, hi, 150)
        y = np.concatenate([0.6 * b / np.abs(b).max(), y])
    if kind == "click":
        c = burst(0.006, 2500, 9000, 600)
        y = np.concatenate([c / np.abs(c).max(), np.zeros(int(0.01 * SR)), 0.6 * y[: int(0.07 * SR)] * env(0.07, a=0.005, r=0.03)])
    return y


def residents():
    """居民的音节：soft ×5、beak ×4、click ×3、bleat ×3，文件名 syl_<组>_<n>。每个约 0.13 秒。"""
    for kind, items in SYLLABLES.items():
        for i, (c, v) in enumerate(items, 1):
            y = syllable(c, v, kind=kind, dur=0.1 if kind == "click" else 0.13)
            write(f"syl_{kind}_{i}", y, -3)


def driver():
    """司机：三句粗嗓门的叫喊（基频 210–300 Hz，共振峰撑在 500–2500 Hz 让手机听得见）。"""
    lines = {
        "driver_call": ([(0, "h"), (0.03, "e"), (0.17, "i")], sweep(300, 240, 0.32), 0.32),  # 嘿！
        "driver_grumble": ([(0, "m"), (0.06, "ə"), (0.2, "m")], sweep(230, 190, 0.42), 0.42),  # 哼嗯…
        "driver_cheer": ([(0, "h"), (0.03, "a"), (0.14, "o"), (0.2, "o")], np.concatenate([sweep(250, 340, 0.14), sweep(340, 280, 0.22)]), 0.36),  # 好嘞！
    }
    for name, (seq, f0, dur) in lines.items():
        seq = [(t, v if v in VOWELS else "ə") for t, v in seq]
        y = vocal(f0, seq, dur, scale=0.95, breath=0.08) * env(dur, a=0.01, r=0.07)
        if name != "driver_grumble":
            y = np.concatenate([0.25 * burst(0.03, 800, 4000, 60) * np.abs(y).max(), y])
        write(name, room(y, 0.1), -3)


def hamster():
    """福利社仓鼠：三声吱吱（问好、谢谢、发愁）。"""
    sounds = {
        "hamster_hi": [(0.0, 0.07, 900, 1250), (0.1, 0.09, 1000, 1400)],
        "hamster_thanks": [(0.0, 0.06, 1100, 1300), (0.08, 0.06, 1200, 1450), (0.16, 0.12, 1300, 1700)],
        "hamster_hmm": [(0.0, 0.18, 950, 820), (0.22, 0.2, 880, 700)],
    }
    for name, parts in sounds.items():
        y = np.zeros(int(0.5 * SR))
        for at, d, f0, f1 in parts:
            f = sweep(f0, f1, d)
            v = vocal(f, [(0, "i"), (d * 0.5, "e")], d, scale=1.7, tilt=0.4) * env(d, a=0.006, r=0.02)
            place(y, v / np.abs(v).max(), at)
        write(name, y, -4)


def owl():
    """猫头鹰经理：两个新的叫声变体（和原来的 owl_hoot 轮换），再加 '嗯嗯'（满意）和 '嗯……'（不太满意）。"""
    def hoot(f0, d):
        # 猫头鹰的 '呼' 接近正弦：基频 + 一点 2、3 次谐波 + 气声
        t = t_axis(d)
        f = f0 * (1 + 0.04 * np.sin(np.pi * t / d))
        v = osc(f, d, "sine") + 0.3 * osc(2 * f, d, "sine") + 0.12 * osc(3 * f, d, "sine")
        v += 0.08 * bp(noise(d), 700, 2500)
        return v / np.abs(v).max() * env(d, a=0.045, r=0.12)
    y = np.zeros(int(1.0 * SR))
    place(y, hoot(470, 0.32), 0)
    place(y, 0.8 * hoot(420, 0.45), 0.4)
    write("owl_hoot_2", room(y, 0.25, 0.9), -3)
    y = np.zeros(int(0.9 * SR))
    place(y, hoot(500, 0.18), 0)
    place(y, 0.9 * hoot(500, 0.18), 0.22)
    place(y, 0.8 * hoot(445, 0.35), 0.44)
    write("owl_hoot_3", room(y, 0.25, 0.9), -3)
    y = np.zeros(int(0.6 * SR))
    for at, f0, f1 in [(0, 390, 450), (0.2, 420, 500)]:
        v = vocal(sweep(f0, f1, 0.16), [(0, "n"), (0.05, "ə")], 0.16, scale=1.0) * env(0.16, a=0.01, r=0.04)
        place(y, v / np.abs(v).max(), at)
    write("owl_pleased", room(y, 0.15), -3)
    d = 0.55
    v = vocal(sweep(420, 330, d), [(0, "n"), (0.1, "ə"), (0.4, "n")], d, scale=1.0) * env(d, a=0.02, r=0.1)
    write("owl_hmm", room(v, 0.15), -3)


FUNCS = [jump_charge, jump_charge_max, jump_release, jump_whoosh, aim_predict, land_bloop, tongue_thwip, slurp,
         perfect_sparkle, fall_whistle, swim_climb, swim_panic, truck_slowdown, truck_speedup, exhaust_puff,
         deliver_happy, deliver_confused, deliver_unhappy, coin, coin_loss, cash_register, urgent_alert, urgent_tick,
         urgent_fail, bag_full, parcel_pickup_pop, stamp_chk, aww_missed, warn_pulse, warn_pop, hint_pop, toast_blip,
         lasso_whirl, rope_snap, upgrade, rating_good, rating_bad, achievement, rank_up, chapter_clear, day_start,
         map_unlock, sad_trombone, gift_open, letter_open, frame_tap, tab_switch, purchase, equip, gust, thunder, gull,
         firecracker, ice_crack, leaf_rustle, residents, driver, hamster, owl]

if __name__ == "__main__":
    for fn in FUNCS:
        fn()
