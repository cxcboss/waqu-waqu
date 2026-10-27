# 蛙趣蛙趣 环境声循环合成（全部原创）：春天鸟叫、夏天蝉鸣、雨、秋风、冬天的冷风、港口海浪、夜里的蟋蟀。
# 用法: python3 ambience.py <输出目录> [名字…]   -> 每个循环一个 44.1k 单声道 wav，首尾无缝。
#
# 无缝的做法：单个事件（鸟叫、雨滴、蟋蟀）按“环形”摆放，超出结尾的部分绕回开头；连续的底噪（风、浪）
# 多做一段，再把多出来的尾巴交叉淡入到开头（lib.loop_xfade）。天气的单发声音（雷、海鸥、落叶、冰裂、鞭炮）
# 不烤进循环里，由游戏在循环播放时随机插进去（manifest 的 spots），所以每次听都不一样。
import sys, os
import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import SR, write_wav, loop_xfade, bp, lp, hp  # noqa: E402

OUT = sys.argv[1]
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def ring_place(dst, src, at):
    """环形摆放：超出结尾的部分绕回开头，循环接缝处的事件不会被切断。"""
    i = int(at * SR) % len(dst)
    n = len(src)
    first = min(n, len(dst) - i)
    dst[i:i + first] += src[:first]
    if first < n:
        dst[:n - first] += src[first:]


def chirp(f0, f1, dur, harm=0.15):
    """一声鸟叫的音节：频率从 f0 滑到 f1，带一点二次谐波，起落圆滑。"""
    t = t_axis(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + harm * np.sin(2 * ph)
    return y * np.sin(np.pi * t / dur) ** 1.5


def distant(x, amount):
    """远一点：低通 + 变小。"""
    return lp(x, 9000 - 6000 * amount, 2) * (1 - 0.7 * amount)


def tv_bandpass(x, centers, q):
    """中心频率逐块变化的带通（状态延续，不会咔哒）。centers 每 256 个采样点一个值。"""
    out = np.zeros(len(x))
    zi = np.zeros(2)
    blk = 256
    for j, c in enumerate(centers):
        w0 = 2 * np.pi * min(max(c, 40), SR * 0.45) / SR
        al = np.sin(w0) / (2 * q)
        b = np.array([al, 0, -al]) / (1 + al)
        a = np.array([1, -2 * np.cos(w0) / (1 + al), (1 - al) / (1 + al)])
        seg = x[j * blk:(j + 1) * blk]
        if not len(seg): break
        out[j * blk:j * blk + len(seg)], zi = signal.lfilter(b, a, seg, zi=zi)
    return out


def lfo(n_samples, dur, cycles, phase=0.0):
    """整数个周期的慢变化（循环一圈刚好回到原点）。"""
    t = np.arange(n_samples) / SR
    return np.sin(2 * np.pi * cycles * t / dur + phase)


def save(name, x, peak=0.5):
    if ONLY and name not in ONLY:
        return
    x = hp(x - x.mean(), 60, 2)
    x = x / (np.abs(x).max() + 1e-9) * peak
    write_wav(os.path.join(OUT, name + ".wav"), x)
    print(f"{name:16s} {len(x)/SR:5.2f}s")


# --------------------------------------------------------------------------------------------- 春：鸟
def birds():
    """春天柳湾（主页白天也用）：远远近近的几种小鸟——一串快速的“啾啾啾”、两音的“滴-啾”、一段颤音，中间有安静的空当。"""
    L = 12.0
    y = np.zeros(int(L * SR))
    air = bp(noise(L + 2), 400, 5000)
    y += 0.012 * loop_xfade(air, 0, L, 2)
    # 鸟 A：快速啾啾（一串 6–10 声，往上或往下滑）
    for start, far in [(0.6, 0.2), (5.2, 0.5), (9.4, 0.1)]:
        n = rng.integers(6, 11)
        up = rng.random() < 0.5
        at = start
        for k in range(n):
            d = rng.uniform(0.035, 0.06)
            base = rng.uniform(3200, 4200) * (1 + 0.05 * k * (1 if up else -1))
            c = chirp(base, base * rng.uniform(1.3, 1.6) if up else base * rng.uniform(0.65, 0.8), d)
            ring_place(y, distant(c, far) * rng.uniform(0.5, 0.9), at)
            at += d + rng.uniform(0.025, 0.05)
    # 鸟 B：两音的“滴-啾”，重复两三次
    for start, far in [(2.4, 0.35), (7.6, 0.6)]:
        at = start
        for _ in range(rng.integers(2, 4)):
            a = chirp(4300, 4500, 0.11, harm=0.08) * (1 + 0.1 * np.sin(2 * np.pi * 40 * t_axis(0.11)))
            b = chirp(3400, 2900, 0.13, harm=0.1)
            ring_place(y, distant(a, far) * 0.7, at)
            ring_place(y, distant(b, far) * 0.6, at + 0.14)
            at += rng.uniform(0.45, 0.6)
    # 鸟 C：一段颤音（2.8 kHz 上 22 Hz 的颤动）
    for start, far in [(4.0, 0.4), (10.9, 0.7)]:
        d = rng.uniform(0.45, 0.7)
        t = t_axis(d)
        tr = np.sin(2 * np.pi * (2700 + 300 * t / d) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * t)) ** 2
        ring_place(y, distant(tr * np.sin(np.pi * t / d), far) * 0.5, start)
    save("amb_birds", y)


# --------------------------------------------------------------------------------------------- 夏：蝉
def cicadas():
    """初夏荷花塘：两只近处的蝉一阵一阵地叫（嘶——，4–7 kHz 的高频脉冲），后面一层更远的连续蝉声。"""
    L = 10.0
    n = int(L * SR)
    y = np.zeros(n)
    far = bp(noise(L + 2), 4000, 6500) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 70 * t_axis(L + 2))))
    y += 0.05 * loop_xfade(far, 0, L, 2)
    for start, d, rate, fc in [(0.5, 5.5, 92, 5200), (5.8, 4.6, 108, 5800)]:
        t = t_axis(d)
        pulses = (0.5 + 0.5 * np.sin(2 * np.pi * rate * t)) ** 4
        phrase = np.clip(t / 1.2, 0, 1) ** 2 * np.clip((d - t) / 0.8, 0, 1)
        swell = 0.7 + 0.3 * np.sin(2 * np.pi * 0.6 * t)
        body = bp(noise(d), fc * 0.8, fc * 1.2) * pulses * phrase * swell
        ring_place(y, body * 0.35, start)
    save("amb_cicadas", y)


# --------------------------------------------------------------------------------------------- 雨
def rain():
    """雨季：均匀的雨幕 + 成千上万颗细小的雨点 + 偶尔落在叶子上的“嗒”（雷声另放，见 spots）。"""
    L = 10.0
    n = int(L * SR)
    bed = hp(lp(noise(L + 2), 7000, 2), 300, 2)
    bed = bed + 0.5 * bp(noise(L + 2), 1500, 5000)
    y = 0.25 * loop_xfade(bed, 0, L, 2)
    drop_t = t_axis(0.004)
    for _ in range(9000):
        d = bp(rng.standard_normal(len(drop_t)), 2000, 8000, 1) * np.exp(-drop_t * 900)
        ring_place(y, d * rng.exponential(0.12), rng.uniform(0, L))
    for _ in range(70):
        f = rng.uniform(1400, 3800)
        dur = 0.03
        tt = t_axis(dur)
        p = np.sin(2 * np.pi * f * (1 - 0.3 * tt / dur) * tt) * np.exp(-tt * 120)
        ring_place(y, p * rng.uniform(0.05, 0.18), rng.uniform(0, L))
    save("amb_rain", y)


# --------------------------------------------------------------------------------------------- 秋：风
def wind():
    """秋天枫叶溪：低沉的风，一阵紧一阵松，中心频率在 250–900 Hz 之间游走，带一丝很轻的哨音（落叶另放）。"""
    L = 12.0
    X = 2.0
    n = int((L + X) * SR)
    src = noise(L + X)
    centers = 450 + 250 * lfo(n, L, 1)[::256] + 150 * lfo(n, L, 3, 1.0)[::256]
    body = tv_bandpass(src, centers, 1.1)
    gust = 0.55 + 0.3 * lfo(n, L, 2, 0.5) + 0.15 * lfo(n, L, 5, 2.0)
    whistle = tv_bandpass(noise(L + X), centers * 2.2, 18) * 0.25
    y = loop_xfade(body * gust + whistle * np.clip(gust - 0.5, 0, 1), 0, L, X)
    save("amb_wind", y)


# --------------------------------------------------------------------------------------------- 冬：冷风
def winter():
    """冬天冰河：更细更冷的风（800 Hz–4 kHz 的嘶嘶声），远处一点点口哨似的呼啸（冰裂声另放）。"""
    L = 12.0
    X = 2.0
    n = int((L + X) * SR)
    centers = 1600 + 700 * lfo(n, L, 1, 2.0)[::256] + 300 * lfo(n, L, 4)[::256]
    body = tv_bandpass(noise(L + X), centers, 0.8)
    level = 0.62 + 0.24 * lfo(n, L, 2, 1.0) + 0.14 * lfo(n, L, 3)
    howl = tv_bandpass(noise(L + X), 900 + 200 * lfo(n, L, 1, 0.3)[::256], 25) * 0.4
    y = loop_xfade(body * level + howl * np.clip(level - 0.4, 0, 1), 0, L, X)
    save("amb_winter", y)


# --------------------------------------------------------------------------------------------- 年末：港口
def harbor():
    """年末港口集市：两道慢慢涌上来又碎开的海浪（各 6 秒），浪退时细碎的“沙沙”（海鸥另放）。"""
    L = 12.0
    n = int(L * SR)
    y = np.zeros(n)
    y += 0.05 * loop_xfade(lp(noise(L + 2), 500, 2), 0, L, 2)
    for start in [0.0, 6.0]:
        d = 6.0
        t = t_axis(d)
        swell = np.clip(t / 2.6, 0, 1) ** 2 * np.exp(-np.maximum(t - 2.6, 0) * 1.4)
        roll = lp(noise(d), 700, 2) * swell
        crash_env = np.where(t > 2.1, np.exp(-np.maximum(t - 2.7, 0) * 1.6), 0) * np.clip((t - 2.1) / 0.6, 0, 1) ** 2
        crash = bp(noise(d), 700, 5000) * crash_env
        fizz = hp(noise(d), 2500) * np.where(t > 3.0, np.exp(-(t - 3.0) * 0.9), 0) * np.clip((t - 3.0) / 0.5, 0, 1)
        ring_place(y, 0.6 * roll + 0.35 * crash + 0.12 * fizz, start + rng.uniform(-0.2, 0.2))
    save("amb_harbor", y)


# --------------------------------------------------------------------------------------------- 夜：蟋蟀
def crickets():
    """夜里（主页晚上、第 19 天萤火虫夜路）：三只蟋蟀各唱各的“唧唧唧”（4.4–4.9 kHz），加一层很远的连续虫鸣。"""
    L = 10.0
    n = int(L * SR)
    y = np.zeros(n)
    trill = np.sin(2 * np.pi * 3900 * t_axis(L)) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * t_axis(L))) ** 6
    y += 0.06 * lp(trill, 6000)
    for f, rate, pulses, far in [(4700, 1.5, 3, 0.1), (4450, 1.2, 4, 0.35), (4900, 1.7, 3, 0.6)]:
        at = rng.uniform(0, 0.5)
        while at < L:
            for k in range(pulses):
                d = 0.013
                tt = t_axis(d)
                p = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / d) ** 2
                ring_place(y, distant(p, far) * 0.8, at + k * 0.026)
            at += 1 / rate * rng.uniform(0.9, 1.1)
    save("amb_crickets", y)


if __name__ == "__main__":
    for fn in [birds, cicadas, rain, wind, winter, harbor, crickets]:
        fn()
