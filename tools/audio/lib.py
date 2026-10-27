# 音频工具共用的小函数：读写、滤波、响度（ITU-R BS.1770 K 计权）、手机外放模拟、限幅、编码。
# 只依赖 numpy + scipy + ffmpeg（带 libmp3lame）。
import os, subprocess, wave
import numpy as np
from scipy import signal

SR = 44100


def load(path, sr=SR):
    """任何格式 → 单声道 float64（ffmpeg 解码）。"""
    raw = subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(float)
    assert len(x), path
    return x


def write_wav(path, x, sr=SR):
    pcm = (np.clip(np.asarray(x, float), -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def encode(x, path, kbps, sr=SR, out_sr=None):
    """单声道 mp3。out_sr 给 BGM 用 32 kHz，省码率。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    cmd = ["ffmpeg", "-v", "quiet", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-"]
    if out_sr: cmd += ["-ar", str(out_sr)]
    cmd += ["-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-map_metadata", "-1", "-write_xing", "1", path]
    subprocess.run(cmd, input=pcm, check=True)


def db(x):
    return 20 * np.log10(np.abs(x) + 1e-12)


# ---------------------------------------------------------------- 滤波

def _sos(kind, fc, order, sr):
    return signal.butter(order, fc, btype=kind, fs=sr, output="sos")


def hp(x, fc, order=2, sr=SR):
    return signal.sosfilt(_sos("high", fc, order, sr), x)


def lp(x, fc, order=2, sr=SR):
    return signal.sosfilt(_sos("low", fc, order, sr), x)


def bp(x, lo, hi, order=2, sr=SR):
    return signal.sosfilt(_sos("band", [lo, hi], order, sr), x)


def biquad(kind, f0, q=0.707, gain_db=0.0, sr=SR):
    """RBJ cookbook biquad (low/high shelf, peaking)。返回 (b, a)。"""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / sr
    al = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == "peak":
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == "lowshelf":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + s), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - s)]
        a = [(A + 1) + (A - 1) * c + s, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - s]
    elif kind == "highshelf":
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s)]
        a = [(A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s]
    else:
        raise ValueError(kind)
    return np.array(b) / a[0], np.array(a) / a[0]


def eq(x, bands, sr=SR):
    """bands: [(kind, f0, gain_db, q)]；kind 还可以是 'hp' / 'lp'（gain 位置填阶数）。"""
    for kind, f0, g, q in bands:
        if kind == "hp": x = hp(x, f0, int(g), sr)
        elif kind == "lp": x = lp(x, f0, int(g), sr)
        else:
            b, a = biquad(kind, f0, q, g, sr)
            x = signal.lfilter(b, a, x)
    return x


def phone(x, sr=SR):
    """手机外放的粗略模拟（与审计用的一致）：450 Hz 4 阶高通 + 9 kHz 低通。"""
    return lp(hp(hp(x, 450, 2, sr), 450, 2, sr), 9000, 2, sr)


# ---------------------------------------------------------------- 响度

def kweight(x, sr=SR):
    # BS.1770 第一级：高架；第二级：RLB 高通（任意采样率的解析系数，同 pyloudnorm）
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    y = signal.lfilter(b, a, x)
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    a0 = 1 + K / Q + K * K
    return signal.lfilter([1, -2, 1], [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0], y)


def momentary(x, sr=SR):
    """400 ms 窗、100 ms 步长的瞬时响度序列（LUFS）。短于 400 ms 的声音补静音。"""
    y = kweight(np.concatenate([x, np.zeros(int(0.4 * sr))]), sr) ** 2
    w, h = int(0.4 * sr), int(0.1 * sr)
    c = np.concatenate([[0], np.cumsum(y)])
    n = max(1, (len(y) - w) // h + 1)
    ms = np.array([(c[i * h + w] - c[i * h]) / w for i in range(n)])
    return -0.691 + 10 * np.log10(ms + 1e-15)


def integrated(x, sr=SR):
    """门限积分响度（−70 LUFS 绝对门、−10 LU 相对门）。"""
    m = momentary(x, sr)
    m = m[m > -70]
    if not len(m): return -70.0
    rel = 10 * np.log10(np.mean(10 ** (m / 10))) - 10
    m = m[m > rel]
    return float(10 * np.log10(np.mean(10 ** (m / 10))))


def loud(x, sr=SR):
    """一个声音的“有多响”：瞬时响度最大值（全频）和手机外放下的同一值。"""
    return float(momentary(x, sr).max()), float(momentary(phone(x, sr), sr).max())


# ---------------------------------------------------------------- 动态

def limit(x, ceiling_db=-1.0, release=0.06, look=0.003, sr=SR):
    """简单的前瞻峰值限幅：把峰值压到 ceiling 以下，过渡平滑，不削波。"""
    c = 10 ** (ceiling_db / 20)
    a = np.abs(x)
    if a.max() <= c: return x
    n = int(look * sr)
    need = np.minimum(1.0, c / np.maximum(a, 1e-9))
    # 前瞻：每个点取后面 n 个点里最小的增益
    pad = np.concatenate([need, np.ones(n)])
    g = np.minimum.reduce([pad[i:i + len(need)] for i in range(0, n + 1, max(1, n // 8))])
    # 释放：增益回升时按时间常数慢慢回到 1
    k = np.exp(-1 / (release * sr))
    out = np.empty_like(g)
    cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else v + (cur - v) * k
        out[i] = cur
    y = x * out
    return y * min(1.0, c / (np.abs(y).max() + 1e-12))


def fade(x, fi=0.003, fo=0.02, sr=SR):
    x = x.copy()
    ni, no = int(fi * sr), int(fo * sr)
    if ni: x[:ni] *= np.linspace(0, 1, ni)
    if no: x[-no:] *= np.linspace(1, 0, no) ** 1.5
    return x


def trim(x, thr_db=-50, pre=0.004, post=0.01, sr=SR):
    e = np.abs(x)
    idx = np.where(e > e.max() * 10 ** (thr_db / 20))[0]
    a = max(0, idx[0] - int(pre * sr))
    b = min(len(x), idx[-1] + int(post * sr))
    return x[a:b]


def loop_xfade(x, start, length, xfade, sr=SR):
    """从 start 起取 length 秒做循环：把其后 xfade 秒等功率交叉淡入到开头，接缝无缝。"""
    a, L, X = int(start * sr), int(length * sr), int(xfade * sr)
    seg = x[a: a + L + X].copy()
    assert len(seg) == L + X, "not enough audio after the loop end for the crossfade"
    w = np.linspace(0, 1, X)
    seg[:X] = seg[:X] * np.sin(w * np.pi / 2) + seg[L:L + X] * np.cos(w * np.pi / 2)
    return seg[:L]
