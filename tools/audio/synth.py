# 蛙趣蛙趣 卡通音效合成（全部原创，可随意商用）
# 用法: python3 synth.py <输出目录>   -> 每个音效一个 44.1k 单声道 wav
import sys, os, wave
import numpy as np
from scipy import signal

SR = 44100
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


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
        for k in range(1, 16):
            y += np.sin(k * ph) / k * (k * f.max() < SR / 2.2)
        return y * 0.6
    if shape == "square":
        y = np.zeros(n)
        for k in range(1, 16, 2):
            y += np.sin(k * ph) / k * (k * f.max() < SR / 2.2)
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


def write(name, x, peak_db=-1.0):
    x = np.asarray(x, float)
    x = x - np.mean(x)
    x = x / (np.abs(x).max() + 1e-9) * 10 ** (peak_db / 20)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"{name:22s} {len(x)/SR:5.2f}s")


# ---------- 跳跃 ----------
def jump_charge():
    """按住蓄力：橡皮筋拉紧 + 音高慢慢升高（1.4s，松手时由游戏停止播放）。"""
    dur = 1.4
    t = t_axis(dur)
    f = sweep(200, 620, dur)
    trem = 1 + 0.25 * np.sin(2 * np.pi * (8 + 10 * t / dur) * t)
    tone = (0.7 * osc(f, dur, "tri") + 0.3 * osc(f * 2, dur, "sine")) * trem
    tone = lp(tone, 2500)
    # 橡皮筋“吱吱”颗粒，越拉越密
    creak = np.zeros_like(t)
    tt = 0.05
    while tt < dur - 0.05:
        g = bp(noise(0.012), 1800, 4200) * np.hanning(int(0.012 * SR))
        place(creak, g * (0.3 + 0.7 * tt / dur), tt)
        tt += 0.09 - 0.06 * tt / dur
    y = tone * env(dur, a=0.15, r=0.05) * (0.4 + 0.6 * t / dur) + 0.35 * creak
    write("jump_charge", y, -4)


def jump_charge_max():
    """蓄力到满：一声清脆的小铃。"""
    y = room(bell(1568, 0.5) + 0.5 * bell(2093, 0.5), wet=0.2)
    write("jump_charge_max", y, -6)


def jump_release():
    """弹弓松手起跳：'嗖' + 卡通弹簧 'boing'。"""
    dur = 0.55
    t = t_axis(dur)
    thwip = bp(noise(0.08), 1500, 6000) * np.linspace(1, 0, int(0.08 * SR)) ** 2
    base = sweep(170, 430, dur)
    wob = 1 + 0.35 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 7)
    boing = osc(base * wob, dur, "tri") * env(dur, a=0.004, decay=5.5, r=0.05)
    boing = lp(boing, 3000)
    y = np.zeros(int(dur * SR))
    place(y, 0.45 * thwip, 0)
    place(y, boing, 0.015)
    write("jump_release", room(y, 0.12), -2)


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
    """瞄准 2 秒后出现预测轨迹：一串轻轻的叮。"""
    notes = [1319, 1568, 1760, 2093]  # E6 G6 A6 C7 五声音阶
    y = np.zeros(int(0.9 * SR))
    for i, f in enumerate(notes):
        place(y, kalimba(f, 0.5) * (0.6 + 0.1 * i), i * 0.05)
    write("aim_predict", room(y, 0.25), -8)


def land_bloop():
    """落地回弹的小 '啵'（叠在落地音效上，给柔软弹性感）。"""
    dur = 0.16
    y = osc(sweep(520, 190, dur), dur, "sine") * env(dur, a=0.002, decay=18, r=0.02)
    write("land_bloop", y, -4)


# ---------- 落水 / 游泳 ----------
def fall_whistle():
    """失足落水前的滑哨（卡通下坠音）。"""
    dur = 0.55
    t = t_axis(dur)
    f = sweep(1500, 380, dur) * (1 + 0.02 * np.sin(2 * np.pi * 7 * t))
    y = osc(f, dur, "sine") + 0.15 * osc(f * 2, dur, "sine")
    y += 0.05 * bp(noise(dur), 800, 3000)
    write("fall_whistle", y * env(dur, a=0.03, r=0.08), -6)


def swim_climb():
    """游上岸：三个向上冒的泡泡 + 一声轻快的 '啵'。"""
    y = np.zeros(int(0.6 * SR))
    for i, (f0, f1) in enumerate([(300, 700), (380, 900), (460, 1150)]):
        d = 0.07
        b = osc(sweep(f0, f1, d), d, "sine") * env(d, a=0.002, decay=20, r=0.01)
        place(y, b * (0.7 + 0.15 * i), i * 0.08)
    place(y, marimba(1047, 0.3) * 0.6, 0.27)
    write("swim_climb", room(y, 0.15), -3)


def swim_panic():
    """落水后提示连点：急促的水泡咕噜声（可循环 1s）。"""
    dur = 1.0
    y = np.zeros(int(dur * SR))
    tt = 0.0
    while tt < dur - 0.06:
        d = 0.04 + 0.03 * rng.random()
        f0 = 250 + 300 * rng.random()
        b = osc(sweep(f0, f0 * 2.2, d), d, "sine") * env(d, a=0.002, decay=30, r=0.008)
        place(y, b * (0.4 + 0.6 * rng.random()), tt)
        tt += 0.05 + 0.06 * rng.random()
    y *= 0.6 + 0.4 * np.sin(np.pi * t_axis(dur) / dur)
    write("swim_bubbles", y, -10)


# ---------- 车辆 ----------
def truck_slowdown():
    """青蛙回到车上、车辆减速：发动机降调 + 刹车小吱声。"""
    dur = 0.9
    t = t_axis(dur)
    eng = lp(osc(sweep(130, 70, dur), dur, "saw"), 600) * env(dur, a=0.03, r=0.2)
    sq = osc(1900 * (1 + 0.03 * np.sin(2 * np.pi * 30 * t)), dur, "sine")
    sq *= np.exp(-((t - 0.35) / 0.12) ** 2) * 0.25
    write("truck_slowdown", eng + sq, -6)


def truck_speedup():
    """再次起跳后车辆恢复速度：发动机升调。"""
    dur = 0.8
    eng = lp(osc(sweep(70, 150, dur), dur, "saw"), 700) * env(dur, a=0.05, r=0.25)
    write("truck_speedup", eng, -6)


# ---------- 订单与居民 ----------
def deliver_happy():
    """居民开心签收：木琴上行琶音。"""
    y = np.zeros(int(0.9 * SR))
    for i, f in enumerate([523, 659, 784, 1047]):
        place(y, marimba(f, 0.5), i * 0.07)
    write("deliver_happy", room(y, 0.18), -2)


def deliver_confused():
    """居民疑惑（送错/没买）：卡通 '嗯？' 上扬。"""
    dur = 0.45
    f0 = sweep(190, 330, dur, "lin") * (1 + 0.01 * np.sin(2 * np.pi * 6 * t_axis(dur)))
    y = formant_voice(f0, dur, "m") * env(dur, a=0.04, r=0.12)
    place(y, 0.25 * marimba(587, 0.4), 0)
    write("deliver_confused", y, -3)


def deliver_unhappy():
    """居民不满：低沉的 '哼～'。"""
    dur = 0.5
    f0 = sweep(240, 150, dur)
    y = formant_voice(f0, dur, "o", growl=0.35) * env(dur, a=0.02, r=0.15)
    write("deliver_unhappy", y, -3)


def coin():
    """获得金币/小费：经典两音 '叮叮'（柔和版）。"""
    y = np.zeros(int(0.6 * SR))
    place(y, bell(1976, 0.3) * 0.7, 0)
    place(y, bell(2637, 0.5), 0.07)
    write("coin", room(y, 0.12), -4)


def cash_register():
    """货到付款收款：'咔-叮'。"""
    y = np.zeros(int(0.9 * SR))
    click = hp(noise(0.03), 2000) * np.linspace(1, 0, int(0.03 * SR)) ** 3
    place(y, 0.5 * click, 0)
    place(y, 0.5 * click, 0.06)
    place(y, bell(2349, 0.7) + 0.6 * bell(3136, 0.7), 0.1)
    write("cash_register", room(y, 0.12), -3)


def urgent_alert():
    """新加急订单 / 加急快超时：两组急促的木琴双音。"""
    y = np.zeros(int(0.8 * SR))
    for k, at in enumerate([0, 0.11, 0.3, 0.41]):
        place(y, marimba(1175 if k % 2 == 0 else 1568, 0.25, bright=1.4), at)
    write("urgent_alert", y, -3)


def urgent_fail():
    """加急超时：下行 '嘣～'。"""
    dur = 0.6
    y = lp(osc(sweep(330, 140, dur), dur, "square"), 1200) * env(dur, a=0.005, decay=3, r=0.1)
    write("urgent_late", y, -5)


def bag_full():
    """背包满了/太重：木头 '咚' 一声闷响。"""
    dur = 0.3
    y = osc(sweep(210, 130, dur), dur, "sine") * env(dur, a=0.002, decay=14, r=0.03)
    y += 0.3 * bp(noise(dur), 300, 1200) * env(dur, a=0.001, decay=60, r=0.02)
    write("bag_full", y, -3)


# ---------- 结算 / 升级 ----------
def upgrade():
    """购买装备升级：上行闪光琶音。"""
    y = np.zeros(int(1.4 * SR))
    for i, f in enumerate([523, 659, 784, 1047, 1319, 1568]):
        place(y, kalimba(f, 0.7) * (0.6 + 0.08 * i), i * 0.06)
    shimmer = bp(noise(1.0), 5000, 9000) * env(1.0, a=0.3, decay=2, r=0.3) * 0.08
    place(y, shimmer, 0.3)
    write("upgrade", room(y, 0.25), -2)


def sad_trombone():
    """被甩出屏幕/当天失败：卡通 '哇哇哇哇～'。"""
    notes = [(311, 0.32), (294, 0.32), (277, 0.32), (262, 1.0)]
    y = np.zeros(int(2.2 * SR))
    at = 0
    for i, (f, d) in enumerate(notes):
        t = t_axis(d)
        vib = 1 + (0.025 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1) if i == 3 else 0)
        tone = osc(f * vib, d, "saw")
        # 开合的“哇”音色：低通截止频率随包络起伏
        e = env(d, a=0.03, r=0.12)
        out = np.zeros_like(tone)
        blk = 512
        for j in range(0, len(tone), blk):
            fc = 400 + 1600 * e[j]
            out[j:j + blk] = lp(tone[max(0, j - 2048):j + blk], fc)[-len(tone[j:j + blk]):]
        place(y, out * e, at)
        at += d * 0.95
    write("day_fail", room(y, 0.15), -2)


for fn in [jump_charge, jump_charge_max, jump_release, jump_whoosh, aim_predict, land_bloop,
           fall_whistle, swim_climb, swim_panic, truck_slowdown, truck_speedup,
           deliver_happy, deliver_confused, deliver_unhappy, coin, cash_register,
           urgent_alert, urgent_fail, bag_full, upgrade, sad_trombone]:
    fn()
