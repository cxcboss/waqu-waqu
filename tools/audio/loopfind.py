# 在一首曲子里找一段能无缝循环的区间：开头和“开头 + 长度”之后的音乐最像（和声 + 节奏都对得上），
# 再在采样级别对齐相位。build.py 里每首 BGM 的 loop=(start, length) 就是用它量出来的。
# 用法: python3 loopfind.py <文件> <最短秒> <最长秒> [最早开始秒] [最晚开始秒]
import sys
import numpy as np
from lib import load

SR = 22050
HOP = 256


def features(x):
    n = 2048
    win = np.hanning(n)
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, (0, n)), n)[::HOP]
    S = np.abs(np.fft.rfft(frames * win, axis=1))
    f = np.fft.rfftfreq(n, 1 / SR)
    ok = (f > 80) & (f < 4000)
    midi = np.round(69 + 12 * np.log2(f[ok] / 440)).astype(int) % 12
    C = np.zeros((len(S), 12))
    for k in range(12):
        C[:, k] = S[:, ok][:, midi == k].sum(1)
    C /= np.linalg.norm(C, axis=1, keepdims=True) + 1e-9
    e = np.log(S[:, (f > 100) & (f < 8000)].sum(1) + 1e-6)
    onset = np.maximum(0, np.diff(e, prepend=e[0]))
    onset = (onset - onset.mean()) / (onset.std() + 1e-9)
    return C, onset


def find(path, lmin, lmax, smin=0.0, smax=None, window=6.0):
    x = load(path, SR)
    C, on = features(x)
    fps = SR / HOP
    W = int(window * fps)
    nfr = len(on)
    best = (-9, 0, 0)
    s_lo = int(smin * fps)
    s_hi = int((smax if smax is not None else len(x) / SR) * fps)

    def wsum(v):  # 每个起点往后 W 帧的和
        c = np.concatenate([[0], np.cumsum(v)])
        return c[W:] - c[:-W]

    for L in range(int(lmin * fps), int(lmax * fps) + 1):
        n = nfr - L
        if n <= W: break
        harm = wsum((C[:n] * C[L:L + n]).sum(1)) / W
        a, b = on[:n], on[L:L + n]
        sa, sb, sab, saa, sbb = wsum(a), wsum(b), wsum(a * b), wsum(a * a), wsum(b * b)
        cov = sab - sa * sb / W
        rhythm = cov / np.sqrt(np.maximum((saa - sa * sa / W) * (sbb - sb * sb / W), 1e-9))
        score = harm + rhythm
        lo, hi = s_lo, min(s_hi, len(score))
        if hi <= lo: continue
        i = lo + int(np.argmax(score[lo:hi]))
        if score[i] > best[0]:
            best = (float(score[i]), i, L)
    score, s, L = best
    # 采样级对齐：在 ±25 ms 里找波形最像的那个长度
    s_smp = int(s * HOP)
    L_smp = int(L * HOP)
    seg = int(0.08 * SR)
    ref = x[s_smp:s_smp + seg]
    lags = range(-int(0.025 * SR), int(0.025 * SR))
    cc = [np.dot(ref, x[s_smp + L_smp + d:s_smp + L_smp + d + seg]) for d in lags]
    L_smp += list(lags)[int(np.argmax(cc))]
    return s_smp / SR, L_smp / SR, score


if __name__ == "__main__":
    p = sys.argv[1]
    lmin, lmax = float(sys.argv[2]), float(sys.argv[3])
    smin = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    smax = float(sys.argv[5]) if len(sys.argv) > 5 else None
    s, L, score = find(p, lmin, lmax, smin, smax)
    print(f"start {s:.4f}  length {L:.4f}  score {score:.3f}  (1.0 harmony + 1.0 rhythm = 2.0 is a perfect repeat)")
