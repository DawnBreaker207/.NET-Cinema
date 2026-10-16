-- Seed data: 3 sample halls (one per size) with a full seat grid, so a
-- fresh DB has somewhere to schedule showtimes without going through the
-- admin API first. Prices are GLOBAL now (seat_base_prices in 000010_pricing,
-- seeded with working defaults there), so this seed carries no prices.
-- NOT tracked by golang-migrate; apply with `make migrate-seed`.
-- Idempotent: fixed IDs + ON CONFLICT DO NOTHING.
--
-- Row B of each hall is VIP; every other row is standard. This mirrors the
-- "small"/"medium"/"large" built-in templates in size only — the fuller
-- templates (VIP block, couple row, aisle) live in the Go API
-- (POST /admin/halls {"template": "medium"}) since replicating col_span
-- placement correctly in plain SQL is not worth the risk for seed data.

INSERT INTO halls (id, name, rows, seats_per_row, screen_position)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'Hall 1 (Small)',  6, 10, 'front'),
    ('20000000-0000-0000-0000-000000000002', 'Hall 2 (Medium)', 10, 12, 'front'),
    ('20000000-0000-0000-0000-000000000003', 'Hall 3 (Large)',  14, 14, 'front')
ON CONFLICT (id) DO NOTHING;

INSERT INTO seats (id, hall_id, row_index, row_label, col_number, seat_type)
SELECT gen_random_uuid(), h.id, r, chr(64 + r), c,
       CASE WHEN r = 2 THEN 'vip' ELSE 'standard' END
FROM halls h
JOIN LATERAL generate_series(1, h.rows) AS r ON TRUE
JOIN LATERAL generate_series(1, h.seats_per_row) AS c ON TRUE
WHERE h.id IN ('20000000-0000-0000-0000-000000000001',
               '20000000-0000-0000-0000-000000000002',
               '20000000-0000-0000-0000-000000000003')
  AND NOT EXISTS (SELECT 1 FROM seats s WHERE s.hall_id = h.id);
