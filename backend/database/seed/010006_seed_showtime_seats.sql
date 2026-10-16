-- Seed seat inventory for showtimes. Seatmap/hold need showtime_seats rows,
-- which the app only creates on hall layout changes — never for fresh
-- showtimes. Without this, seeded showtimes render seats with an empty
-- showtime_seat_id and hold answers 400.
-- Idempotent: unique (showtime_id, seat_id) + ON CONFLICT DO NOTHING.
-- Scope: only seeded showtimes (30000000-… prefix); never touches the rest.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO showtime_seats (id, showtime_id, seat_id, status)
SELECT gen_random_uuid(), st.id, s.id, 'available'
FROM showtimes st
JOIN seats s ON s.hall_id = st.hall_id
WHERE st.id::text LIKE '30000000-0000-0000-0000-%'
  AND st.deleted_at IS NULL
ON CONFLICT (showtime_id, seat_id) DO NOTHING;
