CREATE TABLE `brands` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `name_unique` UNIQUE INDEX(`name`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `name_unique` UNIQUE INDEX(`name`)
);
--> statement-breakpoint
CREATE TABLE `product_barcodes` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`product_id` bigint NOT NULL,
	`code` varchar(255) NOT NULL,
	`kind` varchar(255) NOT NULL,
	`internal_product_id` bigint GENERATED ALWAYS AS (IF(kind = 'internal', product_id, NULL)) VIRTUAL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `code_unique` UNIQUE INDEX(`code`),
	CONSTRAINT `product_barcodes_product_id_internal_idx` UNIQUE INDEX(`internal_product_id`),
	CONSTRAINT `product_barcodes_kind_check` CHECK(`product_barcodes`.`kind` IN ('internal', 'manufacturer')),
	CONSTRAINT `product_barcodes_code_check` CHECK(`product_barcodes`.`kind` <> 'internal' OR `product_barcodes`.`code` REGEXP '^20[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE `product_fitments` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`product_id` bigint NOT NULL,
	`vehicle_model_id` bigint NOT NULL,
	`year_from` int,
	`year_to` int,
	CONSTRAINT `product_fitments_unique` UNIQUE INDEX(`product_id`,`vehicle_model_id`,`year_from`,`year_to`),
	CONSTRAINT `product_fitments_year_range_check` CHECK(`product_fitments`.`year_from` IS NULL OR `product_fitments`.`year_to` IS NULL OR `product_fitments`.`year_from` <= `product_fitments`.`year_to`)
);
--> statement-breakpoint
CREATE TABLE `product_part_numbers` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`product_id` bigint NOT NULL,
	`part_number` varchar(255) NOT NULL,
	`kind` varchar(255) NOT NULL,
	CONSTRAINT `product_part_numbers_product_id_part_number_unique` UNIQUE INDEX(`product_id`,`part_number`),
	CONSTRAINT `product_part_numbers_kind_check` CHECK(`product_part_numbers`.`kind` IN ('oem', 'alternate'))
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`sku` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`part_number` varchar(255) NOT NULL,
	`category_id` bigint NOT NULL,
	`brand_id` bigint,
	`description` text,
	`unit` varchar(255) NOT NULL DEFAULT 'pcs',
	`bin_location` varchar(255),
	`cost_price` decimal(12,2) NOT NULL DEFAULT (0),
	`price` decimal(10,2) NOT NULL,
	`stock_qty` int NOT NULL DEFAULT 0,
	`reorder_level` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `sku_unique` UNIQUE INDEX(`sku`),
	CONSTRAINT `products_price_check` CHECK(`products`.`price` >= 0),
	CONSTRAINT `products_cost_price_check` CHECK(`products`.`cost_price` >= 0),
	CONSTRAINT `products_stock_qty_check` CHECK(`products`.`stock_qty` >= 0),
	CONSTRAINT `products_reorder_level_check` CHECK(`products`.`reorder_level` >= 0)
);
--> statement-breakpoint
CREATE TABLE `receipt_counters` (
	`year` int PRIMARY KEY,
	`last_number` int NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`sale_id` bigint NOT NULL,
	`product_id` bigint NOT NULL,
	`product_name` varchar(255) NOT NULL,
	`part_number` varchar(255) NOT NULL,
	`quantity` int NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL DEFAULT (0),
	`line_total` decimal(12,2) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `sale_items_quantity_check` CHECK(`sale_items`.`quantity` > 0),
	CONSTRAINT `sale_items_unit_price_check` CHECK(`sale_items`.`unit_price` >= 0),
	CONSTRAINT `sale_items_unit_cost_check` CHECK(`sale_items`.`unit_cost` >= 0),
	CONSTRAINT `sale_items_line_total_check` CHECK(`sale_items`.`line_total` = (`sale_items`.`quantity` * `sale_items`.`unit_price`))
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`receipt_number` varchar(255) NOT NULL,
	`cashier_id` varchar(255) NOT NULL,
	`status` varchar(255) NOT NULL DEFAULT 'completed',
	`voided_at` datetime(3),
	`voided_by` varchar(255),
	`void_reason` text,
	`subtotal` decimal(12,2) NOT NULL,
	`discount` decimal(12,2) NOT NULL DEFAULT (0),
	`total` decimal(12,2) NOT NULL,
	`amount_tendered` decimal(12,2),
	`change_given` decimal(12,2),
	`customer_name` varchar(255),
	`customer_phone` varchar(255),
	`vehicle_no` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `receipt_number_unique` UNIQUE INDEX(`receipt_number`),
	CONSTRAINT `sales_status_check` CHECK(`sales`.`status` IN ('completed', 'voided')),
	CONSTRAINT `sales_voided_check` CHECK((`sales`.`status` = 'voided') = (`sales`.`voided_at` IS NOT NULL)),
	CONSTRAINT `sales_discount_check` CHECK(`sales`.`discount` >= 0 AND `sales`.`discount` <= `sales`.`subtotal`),
	CONSTRAINT `sales_total_check` CHECK(`sales`.`total` = `sales`.`subtotal` - `sales`.`discount`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int PRIMARY KEY DEFAULT 1,
	`shop_name` varchar(255) NOT NULL DEFAULT 'Colombo Auto Spares & Parts',
	`address` text,
	`phone` varchar(255),
	`receipt_footer` text,
	`cashier_max_discount_pct` decimal(5,2) NOT NULL DEFAULT (5.00),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `settings_id_check` CHECK(`settings`.`id` = 1),
	CONSTRAINT `settings_cashier_max_discount_pct_check` CHECK(`settings`.`cashier_max_discount_pct` >= 0 AND `settings`.`cashier_max_discount_pct` <= 100)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`product_id` bigint NOT NULL,
	`change_qty` int NOT NULL,
	`qty_after` int NOT NULL,
	`reason` varchar(255) NOT NULL,
	`sale_id` bigint,
	`note` text,
	`created_by` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `stock_movements_change_qty_check` CHECK(`stock_movements`.`change_qty` <> 0),
	CONSTRAINT `stock_movements_qty_after_check` CHECK(`stock_movements`.`qty_after` >= 0),
	CONSTRAINT `stock_movements_reason_check` CHECK(`stock_movements`.`reason` IN ('opening', 'sale', 'void', 'received', 'adjustment'))
);
--> statement-breakpoint
CREATE TABLE `vehicle_makes` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `name_unique` UNIQUE INDEX(`name`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_models` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`make_id` bigint NOT NULL,
	`name` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `vehicle_models_make_id_name_unique` UNIQUE INDEX(`make_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` varchar(255) PRIMARY KEY,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime(3),
	`refresh_token_expires_at` datetime(3),
	`scope` text,
	`password` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(255) PRIMARY KEY,
	`expires_at` datetime(3) NOT NULL,
	`token` varchar(255) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL,
	`ip_address` varchar(255),
	`user_agent` text,
	`user_id` varchar(255) NOT NULL,
	`impersonated_by` varchar(255),
	CONSTRAINT `token_unique` UNIQUE INDEX(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(255) PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`role` varchar(255),
	`banned` boolean DEFAULT false,
	`ban_reason` text,
	`ban_expires` datetime(3),
	CONSTRAINT `email_unique` UNIQUE INDEX(`email`),
	CONSTRAINT `user_role_check` CHECK(`user`.`role` IN ('owner', 'cashier'))
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(255) PRIMARY KEY,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);
--> statement-breakpoint
CREATE INDEX `product_barcodes_product_id_idx` ON `product_barcodes` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_fitments_product_id_idx` ON `product_fitments` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_fitments_vehicle_model_id_idx` ON `product_fitments` (`vehicle_model_id`);--> statement-breakpoint
CREATE INDEX `product_part_numbers_product_id_idx` ON `product_part_numbers` (`product_id`);--> statement-breakpoint
CREATE INDEX `product_part_numbers_part_number_idx` ON `product_part_numbers` (`part_number`);--> statement-breakpoint
CREATE INDEX `products_part_number_idx` ON `products` (`part_number`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_brand_id_idx` ON `products` (`brand_id`);--> statement-breakpoint
CREATE INDEX `sale_items_sale_id_idx` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_items_product_id_idx` ON `sale_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `sales_cashier_id_idx` ON `sales` (`cashier_id`);--> statement-breakpoint
CREATE INDEX `sales_voided_by_idx` ON `sales` (`voided_by`);--> statement-breakpoint
CREATE INDEX `sales_created_at_idx` ON `sales` (`created_at`);--> statement-breakpoint
CREATE INDEX `sales_status_created_at_idx` ON `sales` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_product_id_idx` ON `stock_movements` (`product_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_sale_id_idx` ON `stock_movements` (`sale_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_created_by_idx` ON `stock_movements` (`created_by`);--> statement-breakpoint
CREATE INDEX `stock_movements_created_at_idx` ON `stock_movements` (`created_at`);--> statement-breakpoint
CREATE INDEX `vehicle_models_make_id_idx` ON `vehicle_models` (`make_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
ALTER TABLE `product_barcodes` ADD CONSTRAINT `product_barcodes_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `product_fitments` ADD CONSTRAINT `product_fitments_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `product_fitments` ADD CONSTRAINT `product_fitments_vehicle_model_id_vehicle_models_id_fkey` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`);--> statement-breakpoint
ALTER TABLE `product_part_numbers` ADD CONSTRAINT `product_part_numbers_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_brand_id_brands_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`);--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_sale_id_sales_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`);--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_cashier_id_user_id_fkey` FOREIGN KEY (`cashier_id`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_voided_by_user_id_fkey` FOREIGN KEY (`voided_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_sale_id_sales_id_fkey` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`);--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_user_id_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `vehicle_models` ADD CONSTRAINT `vehicle_models_make_id_vehicle_makes_id_fkey` FOREIGN KEY (`make_id`) REFERENCES `vehicle_makes`(`id`);--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE;