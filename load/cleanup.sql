-- cleanup.sql — delete k6 throwaway data (users k6-%@test.local + dependents).
-- Run AFTER load runs (data is single-purpose). Best-effort order: children
-- first; if a statement errors on an FK you don't have, adjust that line.
-- Usage (Rocky): docker exec -i cp-postgres psql -U postgres -d cinema < cleanup.sql
-- (peer auth as the postgres OS user needs no password).

-- Audit rows reference bookings (FK) and actors: clear them first.
DELETE FROM audit_logs WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local'));
DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local');
DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local');
DELETE FROM refresh_tokens       WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local');
DELETE FROM booking_seats        WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local'));
DELETE FROM payments             WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local'));
DELETE FROM tickets              WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local'));
DELETE FROM combo_order_items    WHERE combo_order_id IN (SELECT id FROM combo_orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local'));
DELETE FROM combo_orders         WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local');
DELETE FROM bookings             WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local');
DELETE FROM users                WHERE email LIKE 'k6-%@test.local';

-- Verify: both counts must be 0 afterwards.
SELECT (SELECT count(*) FROM users WHERE email LIKE 'k6-%@test.local') AS leftover_users,
       (SELECT count(*) FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'k6-%@test.local')) AS leftover_bookings;
