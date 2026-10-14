CREATE TABLE "product_barcodes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_barcodes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"code" text NOT NULL UNIQUE,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_barcodes_kind_check" CHECK ("kind" IN ('internal', 'manufacturer')),
	CONSTRAINT "product_barcodes_code_check" CHECK ("kind" <> 'internal' OR "code" ~ '^20[0-9]{8}$')
);
--> statement-breakpoint
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes" ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_barcodes_product_id_internal_idx" ON "product_barcodes" ("product_id") WHERE "kind" = 'internal';--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;