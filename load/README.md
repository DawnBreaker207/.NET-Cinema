# k6 load scenarios

Thirteen scenarios for the cinema API. k6 runs them from any machine with
network access to the target — **never on the Rocky app host itself**
(shared CPU/RAM skews both sides).

## Install (load machine only)

Windows: `winget install k6` · Linux/macOS: see k6 docs. Then `k6 version`.

## Target

Default (no typing): LAN `http://192.168.184.138:8082` in `lib/config.js`.
Preset once for every command (PowerShell, persists across terminals):

```powershell
[Environment]::SetEnvironmentVariable('BASE_URL', 'https://cinema.dawn.io.vn', 'User')
```

One run only: `k6 run -e BASE_URL=https://... load/smoke.js` (or
`.\run-all.ps1 -BaseUrl ...`). Precedence: `-e` flag > `BASE_URL` env >
code default.

Do NOT load-test through the Cloudflare domain (free-plan abuse protection may
challenge/block the traffic and the numbers measure the CDN, not the app).

## Order

One command runs everything in order (stops if smoke fails, one JSON per
scenario in `results/`):

```powershell
npm run load
.\run-all.ps1
.\run-all.ps1 -BaseUrl https://cinema.dawn.io.vn   # smoke-only-safe target
```

Single scenarios: `npm run load:smoke`, `load:reads`, `load:booking`,
`load:race`, `load:stepped`, `load:spike`, `load:auth`, `load:admin`,
`load:ratelimit`, `load:ops`, `load:combo`, `load:soak`, `load:events`,
`load:dashboard` (live charts). Extra k6 flags go after `--`
(`npm run load:smoke -- -e BASE_URL=https://...`). No `npm install` needed
(no dependencies).

Or step by step (smoke first, always):

1. `smoke.js` — 1 VU full flow; all checks must pass before anything else.
   Discovers the completable path (mock checkout/confirm behavior is LOGGED).
2. Baseline (no thresholds yet, record only): `reads.js`, `booking.js`.
3. Set thresholds from baseline numbers, then: `stepped.js` (10→50→100→200,
   5 min/level), `spike.js`, `race.js` (exactly 1 winner asserted).
4. Rest: `auth.js`, `admin-reads.js`, `ratelimit.js`, `booking-ops.js`,
   `combo.js`, `soak.js` (30 min), `events.js` (SSE probe, experimental).

```bash
k6 run --out json=result-reads.json -e VUS=50 load/reads.js
K6_WEB_DASHBOARD=true k6 run load/booking.js   # live charts in browser
```

## Results (numbers + charts)

Each run writes 2 files per scenario in `results/`: raw JSON + `.summary.json`.
After a run:

```bash
python load/summary.py results/      # one comparison table (checks, p50/p95/p99, req/s, 409/429/5xx, hold/pay/confirm, race winners)
python load/chart.py results/        # report.html: latency / throughput / error charts per scenario (open in browser)
```

No extra installs (stdlib only). For live charts during a run:
`K6_WEB_DASHBOARD=true k6 run load/reads.js`.

Cloudflare note: the domain path goes through the edge — fine for smoke,
but load runs stay on LAN (`:8082` default). If you see HTML 403s or
`cf-mitigated` headers under load, that is Cloudflare throttling, not the app:
stop the run and switch back to LAN.

## Conventions

- `lib/config.js` — `BASE_URL`, `VUS`, `USERS`, `HOLD_SEATS`, demo accounts.
- `lib/auth.js` — register/login helpers (envelope `{data:{access_token}}`).
- `lib/checks.js` — 409 (lost race) and 429 (rate limit) are EXPECTED and
  counted separately (`expected_409`, `expected_429`); only 5xx/unexpected fail.
- Data partitioning: booking VUs skip `showtimes[0]` (reserved for `race.js`);
  seats partitioned per VU; `idempotency_key` unique per attempt.
- Seed data required on target (`migrations/seed`); demo logins come from it.

## Cleanup

Booking/auth/combo scenarios create real rows. Afterwards:

```bash
docker exec -i cp-postgres psql -U postgres -d cinema < load/cleanup.sql
```

Both verify counts must be 0. Seed demo accounts (`admin/staff/customer@cinema.local)
are NOT touched (only `k6-%@test.local`).
