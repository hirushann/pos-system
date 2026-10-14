INSERT INTO "product_barcodes" ("product_id", "code", "kind", "created_at")
SELECT "id", '20' || LPAD("id"::text, 8, '0'), 'internal', NOW()
FROM "products"
ON CONFLICT DO NOTHING;