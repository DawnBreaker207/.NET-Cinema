-- Seed data: one demo account per role so a fresh DB can log in right away.
-- NOT tracked by golang-migrate (schema_migrations lives in migrations/schema);
-- apply with `make migrate-seed` (runs every *.sql here via psql in order).
-- Idempotent: fixed IDs + ON CONFLICT DO NOTHING, re-running changes nothing.
-- The conflict target is deliberately BARE. `ON CONFLICT (id)` looks tighter but breaks
-- on any database whose admin already exists: the app's own SeedAdmin path creates
-- admin@cinema.local with a DIFFERENT id, so the row collides on the separate unique
-- index over email, the id guard never fires, and because all three accounts share one
-- multi-row INSERT the staff and customer rows are lost with it. That is the natural
-- order for anyone who starts the server first and only then seeds - and it leaves the
-- machine with no customer@cinema.local, which makes the whole customer-only /orders/*
-- tree untestable. Bare DO NOTHING skips just the row that conflicts, on any constraint.
-- Passwords are bcrypt-hashed with pgcrypto's crypt()/gen_salt('bf'), which
-- produces hashes golang.org/x/crypto/bcrypt verifies the same as the app's
-- own SeedAdmin path. accepted_terms_version matches account.terms_version
-- so the seeded accounts can log in without a separate terms-accept step.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, email, password, full_name, role, accepted_terms_version, active)
VALUES
    ('20000000-0000-0000-0000-000000000001', 'admin@cinema.local',    crypt('admin123',    gen_salt('bf', 10)), 'Administrator',  'admin',    1, true),
    ('20000000-0000-0000-0000-000000000002', 'staff@cinema.local',    crypt('staff123',    gen_salt('bf', 10)), 'Demo Staff',     'staff',    1, true),
    ('20000000-0000-0000-0000-000000000003', 'customer@cinema.local', crypt('customer123', gen_salt('bf', 10)), 'Demo Customer',  'customer', 1, true)
ON CONFLICT DO NOTHING;
