#!/usr/bin/env python3
"""Summarize k6 --summary-export JSONs into one comparison table (stdlib only).
Handles k6 v2 flat schema (no 'values' wrapper) and legacy nested schema.
p99 is computed from the raw JSON (summary omits it by default).
Usage: python load/summary.py results/
"""
import glob
import json
import os
import sys


def vals(metric):
    if not isinstance(metric, dict):
        return {}
    if any(k in metric for k in ("passes", "count", "rate", "p(50)", "med", "avg")):
        return metric
    return metric.get("values", {})


def num(v, default=0):
    return v if isinstance(v, (int, float)) else default


def p99_from_raw(path):
    vals_ = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:  # noqa: BLE001
                    continue
                if o.get("type") == "Point" and o.get("metric") == "http_req_duration":
                    vals_.append(o.get("data", {}).get("value", 0))
    except OSError:
        return None
    if not vals_:
        return None
    s = sorted(vals_)
    return s[min(int(0.99 * len(s)), len(s) - 1)]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "results"
    files = sorted(glob.glob(os.path.join(path, "*.summary.json")))
    if not files:
        print(f"no *.summary.json in {path}")
        return 1
    print(f"{'scenario':<14}{'checks':<10}{'p50':<9}{'p95':<9}{'p99':<9}{'req/s':<8}{'409':<6}{'429':<6}{'5xx':<6}")
    for f in files:
        name = os.path.basename(f).rsplit("-", 2)[0]
        try:
            s = json.load(open(f, encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            print(f"{name:<14}UNREADABLE {e}")
            continue
        m = s.get("metrics", {})
        c = vals(m.get("checks", {}))
        p, fl = num(c.get("passes")), num(c.get("fails"))
        rate = p / max(p + fl, 1) * 100
        hd = vals(m.get("http_req_duration", {}))
        p50 = hd.get("p(50)", hd.get("med"))
        p99 = p99_from_raw(f[: -len(".summary.json")] + ".json")
        rps = num(vals(m.get("http_reqs", {})).get("rate"))
        c409 = num(vals(m.get("expected_409", {})).get("count"))
        c429 = num(vals(m.get("expected_429", {})).get("count"))
        c5xx = num(vals(m.get("unexpected_5xx", {})).get("count"))

        def ms(v):
            return f"{v:.1f}" if isinstance(v, (int, float)) else "-"

        print(f"{name:<14}{rate:<10.1f}{ms(p50):<9}{ms(hd.get('p(95)')):<9}{ms(p99):<9}{rps:<8.1f}{c409:<6.0f}{c429:<6.0f}{c5xx:<6.0f}")
        for extra in ("hold_latency", "pay_latency", "confirm_latency"):
            v = vals(m.get(extra, {}))
            if v and num(v.get("count", 1)):
                print(f"{'':<14}{extra}: p50={ms(v.get('p(50)', v.get('med')))} p95={ms(v.get('p(95)'))}")
        w = vals(m.get("race_winners", {}))
        if w and num(w.get("count")):
            print(f"{'':<14}race_winners={num(w.get('count')):.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
