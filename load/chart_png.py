#!/usr/bin/env python3
"""Render PNG charts from k6 raw JSONs (matplotlib, headless).
Usage: python load/chart_png.py results/ [outdir]
Per scenario: latency.png (p95+avg), throughput.png (req/s),
errors.png (5xx% + 429%), bucketed per 10s window.
"""
import glob
import json
import os
import sys
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

BUCKET = 10


def parse_ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:  # noqa: BLE001
        return None


def load_points(path):
    lat, status = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:  # noqa: BLE001
                continue
            if o.get("type") != "Point":
                continue
            m, d = o.get("metric"), o.get("data", {})
            ts = parse_ts(d.get("time", ""))
            if ts is None:
                continue
            if m == "http_req_duration":
                lat.append((ts, d.get("value", 0)))
            elif m == "http_reqs":
                status.append((ts, str((d.get("tags") or {}).get("status", ""))))
    return lat, status


def pct(vals, p):
    if not vals:
        return 0
    s = sorted(vals)
    return s[min(int(p / 100 * len(s)), len(s) - 1)]


def buckets(lat, status):
    if not lat:
        return []
    t0 = int(min(t for t, _ in lat) // BUCKET * BUCKET)
    t1 = int(max(t for t, _ in lat) // BUCKET * BUCKET)
    out = []
    for b in range(t0, t1 + 1, BUCKET):
        lv = [v for t, v in lat if b <= t < b + BUCKET]
        sv = [s for t, s in status if b <= t < b + BUCKET]
        n = len(sv) or 1
        out.append({
            "t": b - t0,
            "p95": pct(lv, 95),
            "avg": sum(lv) / max(len(lv), 1),
            "rps": len(sv) / BUCKET,
            "err": sum(1 for s in sv if s.startswith("5") or s == "0") / n * 100,
            "r429": sum(1 for s in sv if s == "429") / n * 100,
        })
    return out


def one_png(path, title, ylabel, series):
    fig, ax = plt.subplots(figsize=(8, 3.2))
    for name, vals in series:
        ax.plot([b["t"] for b in vals[0]], [b for b in vals[1]], label=name, linewidth=1.5)
    ax.set_title(title)
    ax.set_xlabel("seconds into scenario")
    ax.set_ylabel(ylabel)
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "results"
    outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, "charts")
    os.makedirs(outdir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "*.json")))
    files = [f for f in files if not f.endswith(".summary.json")]
    if not files:
        print(f"no raw result JSON in {src}")
        return 1
    n = 0
    for f in files:
        name = os.path.basename(f).rsplit("-", 2)[0]
        lat, status = load_points(f)
        b = buckets(lat, status)
        if not b:
            print(f"{name}: no data, skipped")
            continue
        one_png(os.path.join(outdir, f"{name}-latency.png"), f"{name} latency", "ms",
                [("p95", (b, [x["p95"] for x in b])), ("avg", (b, [x["avg"] for x in b]))])
        one_png(os.path.join(outdir, f"{name}-throughput.png"), f"{name} throughput", "req/s",
                [("rps", (b, [x["rps"] for x in b]))])
        one_png(os.path.join(outdir, f"{name}-errors.png"), f"{name} errors", "%",
                [("5xx", (b, [x["err"] for x in b])), ("429", (b, [x["r429"] for x in b]))])
        n += 3
    print(f"wrote {n} PNGs to {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
