#!/usr/bin/env python3
"""Build one self-contained HTML report (inline SVG charts) from k6 raw JSONs.
Usage: python load/chart.py results/ report.html
Per scenario: p95 + avg latency, throughput (req/s), error/429 rate — bucketed
per 10s window. No dependencies, no network (open report.html in a browser).
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone

BUCKET = 10  # seconds


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
                lat.append((ts, d.get("value", 0), str((d.get("tags") or {}).get("status", ""))))
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
    t0 = int(min(t for t, _, _ in lat) // BUCKET * BUCKET)
    t1 = int(max(t for t, _, _ in lat) // BUCKET * BUCKET)
    out = []
    for b in range(t0, t1 + 1, BUCKET):
        lv = [v for t, v, _ in lat if b <= t < b + BUCKET]
        sv = [s for t, s in status if b <= t < b + BUCKET]
        n = len(sv) or 1
        out.append({
            "t": b,
            "p95": pct(lv, 95),
            "avg": sum(lv) / max(len(lv), 1),
            "rps": len(sv) / BUCKET,
            "err": sum(1 for s in sv if s.startswith("5") or s == "0") / n * 100,
            "r429": sum(1 for s in sv if s == "429") / n * 100,
        })
    return out


def svg(series_list, yfmt, title, height=140, width=640):
    top, bot, left = 8, 20, 46
    vmax = max([v for _, vals in series_list for v in vals] + [1])
    n = max(len(vals) for _, vals in series_list)
    out = [f"<h3>{title}</h3><svg width='{width}' height='{height + top + bot}' style='border:1px solid #ccc'>"]
    colors = ["#1d7af3", "#e74c3c", "#27ae60", "#f39c12"]
    for si, (name, vals) in enumerate(series_list):
        pts = []
        for i, v in enumerate(vals):
            x = left + (i / max(n - 1, 1)) * (width - left - 8)
            y = top + height - (v / vmax) * height
            pts.append(f"{x:.0f},{y:.0f}")
        out.append(f"<polyline fill='none' stroke='{colors[si % 4]}' stroke-width='2' points='{' '.join(pts)}'/>")
        out.append(f"<text x='{width - 8}' y='{top + 12 + si * 14}' font-size='11' text-anchor='end' fill='{colors[si % 4]}'>{name} max {yfmt(vmax)}</text>")
    out.append(f"<text x='4' y='{top + 10}' font-size='11'>{yfmt(vmax)}</text>")
    out.append(f"<text x='4' y='{top + height}' font-size='11'>0</text></svg>")
    return "\n".join(out)


def main():
    path, out = (sys.argv[1] if len(sys.argv) > 1 else "results"), (sys.argv[2] if len(sys.argv) > 2 else "report.html")
    files = sorted(glob.glob(os.path.join(path, "*.json")))
    files = [f for f in files if not f.endswith(".summary.json")]
    if not files:
        print(f"no raw result JSON in {path}")
        return 1
    parts = ["<html><head><meta charset='utf-8'><title>k6 report</title></head><body><h1>k6 report</h1>"]
    for f in files:
        name = os.path.basename(f).rsplit("-", 2)[0]
        lat, status = load_points(f)
        b = buckets(lat, status)
        parts.append(f"<h2>{name} <small>({len(lat)} samples)</small></h2>")
        if not b:
            parts.append("<p>no data</p>")
            continue
        parts.append(svg([("p95 ms", [x["p95"] for x in b]), ("avg ms", [x["avg"] for x in b])], lambda v: f"{v:.0f}ms", "latency"))
        parts.append(svg([("req/s", [x["rps"] for x in b])], lambda v: f"{v:.1f}/s", "throughput"))
        parts.append(svg([("5xx %", [x["err"] for x in b]), ("429 %", [x["r429"] for x in b])], lambda v: f"{v:.1f}%", "errors"))
    parts.append("</body></html>")
    open(out, "w", encoding="utf-8").write("\n".join(parts))
    print(f"wrote {out} ({len(files)} scenarios)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
