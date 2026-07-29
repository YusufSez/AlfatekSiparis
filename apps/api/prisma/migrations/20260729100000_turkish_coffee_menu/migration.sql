-- Add Türk Kahvesi menu item when missing (idempotent for existing DBs).
INSERT INTO "MenuItem" ("id", "name", "icon", "active", "sortOrder", "createdAt", "updatedAt")
SELECT
  'clturkishcoffee000000001',
  'Türk Kahvesi',
  'turkish_coffee',
  1,
  5,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "MenuItem" WHERE "name" = 'Türk Kahvesi'
);
