# 检查一批声音：时长、峰值、响度（全频 / 手机外放）、手机损失、低频占比、频谱质心；可选出频谱图。
# 用法: python3 inspect_sounds.py <文件或目录>… [--png 输出目录]
import sys, os, glob
import numpy as np
from lib import load, loud, db, phone, SR

args = sys.argv[1:]
png = None
if "--png" in args:
    i = args.index("--png")
    png = args[i + 1]
    args = args[:i] + args[i + 2:]
files = []
for a in args:
    files += sorted(glob.glob(os.path.join(a, "*.*"))) if os.path.isdir(a) else [a]

print(f"{'name':24s} {'dur':>5s} {'peak':>6s} {'Mmax':>6s} {'phone':>6s} {'loss':>5s} {'<300':>5s} {'cent':>6s}")
for f in files:
    x = load(f)
    m, mp = loud(x)
    S = np.abs(np.fft.rfft(x)) ** 2
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    low = S[fr < 300].sum() / S.sum()
    cent = (S * fr).sum() / S.sum()
    name = os.path.splitext(os.path.basename(f))[0]
    flag = " <-- phone loss" if m - mp > 6 else ""
    print(f"{name:24s} {len(x)/SR:5.2f} {db(np.abs(x).max()):6.1f} {m:6.1f} {mp:6.1f} {m-mp:5.1f} {low*100:4.0f}% {cent:6.0f}{flag}")
    if png:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        os.makedirs(png, exist_ok=True)
        fig, ax = plt.subplots(2, 1, figsize=(6, 3.2), gridspec_kw=dict(height_ratios=[1, 2]))
        t = np.arange(len(x)) / SR
        ax[0].plot(t, x, lw=0.4); ax[0].set_xlim(0, t[-1]); ax[0].set_ylim(-1, 1); ax[0].set_title(name, fontsize=8)
        ax[1].specgram(x + 1e-9, NFFT=1024, Fs=SR, noverlap=768, cmap="magma", vmin=-120)
        ax[1].set_ylim(0, 10000); ax[1].axhline(450, color="c", lw=0.5)
        for a in ax: a.tick_params(labelsize=6)
        fig.tight_layout(); fig.savefig(os.path.join(png, name + ".png"), dpi=80); plt.close(fig)
