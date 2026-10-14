CREATE TABLE "brands" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_fitments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_fitments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"vehicle_model_id" bigint NOT NULL,
	"year_from" integer,
	"year_to" integer,
	CONSTRAINT "product_fitments_unique" UNIQUE("product_id","vehicle_model_id","year_from","year_to"),
	CONSTRAINT "product_fitments_year_range_check" CHECK ("year_from" IS NULL OR "year_to" IS NULL OR "year_from" <= "year_to")
);
--> statement-breakpoint
CREATE TABLE "product_part_numbers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_part_numbers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"part_number" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "product_part_numbers_product_id_part_number_unique" UNIQUE("product_id","part_number"),
	CONSTRAINT "product_part_numbers_kind_check" CHECK ("kind" IN ('oem', 'alternate'))
);
--> statement-breakpoint
CREATE TABLE "receipt_counters" (
	"year" integer PRIMARY KEY,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sale_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"sale_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"product_name" text NOT NULL,
	"part_number" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12,2) NOT NULL,
	"unit_cost" numeric(12,2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0),
	CONSTRAINT "sale_items_unit_price_check" CHECK ("unit_price" >= 0),
	CONSTRAINT "sale_items_unit_cost_check" CHECK ("unit_cost" >= 0),
	CONSTRAINT "sale_items_line_total_check" CHECK ("line_total" = ("quantity" * "unit_price"))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"receipt_number" text NOT NULL UNIQUE,
	"cashier_id" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"subtotal" numeric(12,2) NOT NULL,
	"discount" numeric(12,2) DEFAULT '0' NOT NULL,
	"total" numeric(12,2) NOT NULL,
	"amount_tendered" numeric(12,2),
	"change_given" numeric(12,2),
	"customer_name" text,
	"customer_phone" text,
	"vehicle_no" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_status_check" CHECK ("status" IN ('completed', 'voided')),
	CONSTRAINT "sales_voided_check" CHECK (("status" = 'voided') = ("voided_at" IS NOT NULL)),
	CONSTRAINT "sales_discount_check" CHECK ("discount" >= 0 AND "discount" <= "subtotal"),
	CONSTRAINT "sales_total_check" CHECK ("total" = "subtotal" - "discount")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"shop_name" text DEFAULT 'Colombo Auto Spares & Parts' NOT NULL,
	"address" text,
	"phone" text,
	"receipt_footer" text,
	"cashier_max_discount_pct" numeric(5,2) DEFAULT '5.00' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_id_check" CHECK ("id" = 1),
	CONSTRAINT "settings_cashier_max_discount_pct_check" CHECK ("cashier_max_discount_pct" >= 0 AND "cashier_max_discount_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"change_qty" integer NOT NULL,
	"qty_after" integer NOT NULL,
	"reason" text NOT NULL,
	"sale_id" bigint,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_change_qty_check" CHECK ("change_qty" <> 0),
	CONSTRAINT "stock_movements_qty_after_check" CHECK ("qty_after" >= 0),
	CONSTRAINT "stock_movements_reason_check" CHECK ("reason" IN ('opening', 'sale', 'void', 'received', 'adjustment'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_makes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vehicle_makes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "vehicle_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"make_id" bigint NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_models_make_id_name_unique" UNIQUE("make_id","name")
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "part_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" text DEFAULT 'pcs' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "bin_location" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_price" numeric(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "reorder_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "product_fitments_product_id_idx" ON "product_fitments" ("product_id");--> statement-breakpoint
CREATE INDEX "product_fitments_vehicle_model_id_idx" ON "product_fitments" ("vehicle_model_id");--> statement-breakpoint
CREATE INDEX "product_part_numbers_product_id_idx" ON "product_part_numbers" ("product_id");--> statement-breakpoint
CREATE INDEX "product_part_numbers_part_number_idx" ON "product_part_numbers" (lower("part_number"));--> statement-breakpoint
CREATE INDEX "products_part_number_idx" ON "products" (lower("part_number"));--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" (lower("name"));--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_id_idx" ON "products" ("brand_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items" ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_id_idx" ON "sale_items" ("product_id");--> statement-breakpoint
CREATE INDEX "sales_cashier_id_idx" ON "sales" ("cashier_id");--> statement-breakpoint
CREATE INDEX "sales_voided_by_idx" ON "sales" ("voided_by");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "sales" ("created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_product_id_idx" ON "stock_movements" ("product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements" ("sale_id");--> statement-breakpoint
CREATE INDEX "stock_movements_created_by_idx" ON "stock_movements" ("created_by");--> statement-breakpoint
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements" ("created_at");--> statement-breakpoint
CREATE INDEX "vehicle_models_make_id_idx" ON "vehicle_models" ("make_id");--> statement-breakpoint
ALTER TABLE "product_fitments" ADD CONSTRAINT "product_fitments_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_fitments" ADD CONSTRAINT "product_fitments_vehicle_model_id_vehicle_models_id_fkey" FOREIGN KEY ("vehicle_model_id") REFERENCES "vehicle_models"("id");--> statement-breakpoint
ALTER TABLE "product_part_numbers" ADD CONSTRAINT "product_part_numbers_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id");--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_id_user_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_user_id_fkey" FOREIGN KEY ("voided_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_sales_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fkey" FOREIGN KEY ("make_id") REFERENCES "vehicle_makes"("id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_cost_price_check" CHECK ("cost_price" >= 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_reorder_level_check" CHECK ("reorder_level" >= 0);