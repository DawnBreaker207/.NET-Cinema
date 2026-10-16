-- Seed data: the concession catalogue (popcorn/drinks) behind step 2 of the
-- booking wizard. NOT tracked by golang-migrate; apply with `make migrate-seed`.
-- Idempotent: fixed IDs + ON CONFLICT DO NOTHING.
--
-- Why this file exists: `concession_items` shipped empty with no seed and no
-- admin write path, so "Chon combo" was permanently blank on every fresh
-- environment and the only way to fill it was hand-written SQL. The write path
-- now exists (/api/v1/admin/concessions), but a fresh DB still needs something
-- on the shelves for the flow to be demonstrable.
--
-- Prices are int64 whole VND like every other amount in this API — no minor
-- units, no currency column.
--
-- `image_url` points at Unsplash photos (free to hotlink, no attribution required),
-- the same way the movie seed points at picsum. Each one was opened and checked to
-- actually show what the row sells. An empty step 2 made the wizard look broken.

INSERT INTO concession_items (id, name, description, price, active, image_url)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'Combo 1 - Bap ngot + 1 Coca',
     'Mot bap rang bo vi ngot (60oz) va mot Coca-Cola 32oz.', 89000, TRUE,
     'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000002', 'Combo 2 - Bap ngot + 2 Coca',
     'Mot bap rang bo vi ngot (60oz) va hai Coca-Cola 32oz. Vua doi.', 119000, TRUE,
     'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000003', 'Combo Gia dinh',
     'Hai bap rang bo (60oz), bon nuoc ngot 32oz va mot khoai tay chien.', 219000, TRUE,
     'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000004', 'Bap rang bo (60oz)',
     'Mot bap rang bo co lon, chon vi ngot hoac vi pho mai tai quay.', 59000, TRUE,
     'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000005', 'Coca-Cola 32oz',
     'Mot ly Coca-Cola co lon kem da.', 35000, TRUE,
     'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000006', 'Nuoc suoi Dasani 500ml',
     'Mot chai nuoc suoi 500ml.', 20000, TRUE,
     'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=70&fm=jpg&fit=crop'),
    -- One deliberately inactive row: it must NOT appear in GET /combos (public)
    -- but MUST appear in GET /admin/concessions, which is the whole difference
    -- between the two list endpoints. Keeping it here means the distinction is
    -- exercised on any fresh environment instead of only in tests.
    ('30000000-0000-0000-0000-000000000007', 'Combo Tet (ngung ban)',
     'Combo theo mua, da het thoi gian ban. Giu lai de thu lai khi can.', 149000, FALSE,
     'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=70&fm=jpg&fit=crop')
ON CONFLICT (id) DO NOTHING;

-- Backfill for a DB seeded before images existed: ON CONFLICT DO NOTHING cannot
-- reach rows that already exist. Fills EMPTY cells only, never an uploaded image.
UPDATE concession_items c
SET image_url = v.image_url
FROM (VALUES
    ('30000000-0000-0000-0000-000000000001'::uuid, 'https://images.unsplash.com/photo-1505686994434-e3cc5abf1330?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000002'::uuid, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000003'::uuid, 'https://images.unsplash.com/photo-1585647347483-22b66260dfff?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000004'::uuid, 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000005'::uuid, 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000006'::uuid, 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=600&q=70&fm=jpg&fit=crop'),
    ('30000000-0000-0000-0000-000000000007'::uuid, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=70&fm=jpg&fit=crop')
) AS v(id, image_url)
WHERE c.id = v.id AND (c.image_url IS NULL OR c.image_url = '');
