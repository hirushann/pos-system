CREATE TABLE `supplier_invoice_items` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`invoice_id` bigint NOT NULL,
	`product_id` bigint NOT NULL,
	`quantity` int NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_invoice_items_quantity_check` CHECK(`supplier_invoice_items`.`quantity` > 0),
	CONSTRAINT `supplier_invoice_items_unit_cost_check` CHECK(`supplier_invoice_items`.`unit_cost` >= 0),
	CONSTRAINT `supplier_invoice_items_line_total_check` CHECK(`supplier_invoice_items`.`line_total` = (`supplier_invoice_items`.`quantity` * `supplier_invoice_items`.`unit_cost`))
);
--> statement-breakpoint
CREATE TABLE `supplier_refunds` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`invoice_id` bigint NOT NULL,
	`refund_date` date NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`method` varchar(32) NOT NULL,
	`reference` varchar(255),
	`notes` text,
	`created_by` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_refunds_amount_check` CHECK(`supplier_refunds`.`amount` > 0),
	CONSTRAINT `supplier_refunds_method_check` CHECK(`supplier_refunds`.`method` IN ('cash', 'bank_transfer', 'cheque'))
);
--> statement-breakpoint
CREATE TABLE `supplier_return_items` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`return_id` bigint NOT NULL,
	`invoice_item_id` bigint NOT NULL,
	`product_id` bigint NOT NULL,
	`quantity` int NOT NULL,
	`unit_cost` decimal(12,2) NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	CONSTRAINT `supplier_return_items_quantity_check` CHECK(`supplier_return_items`.`quantity` > 0),
	CONSTRAINT `supplier_return_items_line_total_check` CHECK(`supplier_return_items`.`line_total` = (`supplier_return_items`.`quantity` * `supplier_return_items`.`unit_cost`))
);
--> statement-breakpoint
CREATE TABLE `supplier_returns` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`supplier_id` bigint NOT NULL,
	`invoice_id` bigint NOT NULL,
	`return_date` date NOT NULL,
	`credit_note_number` varchar(255),
	`reason` text,
	`total` decimal(12,2) NOT NULL,
	`created_by` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_returns_total_check` CHECK(`supplier_returns`.`total` > 0)
);
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `credit_from_invoice_id` bigint;--> statement-breakpoint
CREATE INDEX `supplier_invoice_items_invoice_id_idx` ON `supplier_invoice_items` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_items_product_id_idx` ON `supplier_invoice_items` (`product_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_credit_from_idx` ON `supplier_payments` (`credit_from_invoice_id`);--> statement-breakpoint
CREATE INDEX `supplier_refunds_invoice_id_idx` ON `supplier_refunds` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `supplier_return_items_return_id_idx` ON `supplier_return_items` (`return_id`);--> statement-breakpoint
CREATE INDEX `supplier_return_items_invoice_item_idx` ON `supplier_return_items` (`invoice_item_id`);--> statement-breakpoint
CREATE INDEX `supplier_returns_supplier_id_idx` ON `supplier_returns` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `supplier_returns_invoice_id_idx` ON `supplier_returns` (`invoice_id`);--> statement-breakpoint
ALTER TABLE `supplier_invoice_items` ADD CONSTRAINT `supplier_invoice_items_invoice_id_supplier_invoices_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `supplier_invoice_items` ADD CONSTRAINT `supplier_invoice_items_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_aX3F6C5O6SSh_fkey` FOREIGN KEY (`credit_from_invoice_id`) REFERENCES `supplier_invoices`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_refunds` ADD CONSTRAINT `supplier_refunds_invoice_id_supplier_invoices_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_refunds` ADD CONSTRAINT `supplier_refunds_created_by_user_id_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_return_id_supplier_returns_id_fkey` FOREIGN KEY (`return_id`) REFERENCES `supplier_returns`(`id`) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_4wZI95gB7dcs_fkey` FOREIGN KEY (`invoice_item_id`) REFERENCES `supplier_invoice_items`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_return_items` ADD CONSTRAINT `supplier_return_items_product_id_products_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_supplier_id_suppliers_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_invoice_id_supplier_invoices_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_returns` ADD CONSTRAINT `supplier_returns_created_by_user_id_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_credit_check` CHECK ((`supplier_payments`.`method` = 'credit') = (`supplier_payments`.`credit_from_invoice_id` IS NOT NULL));--> statement-breakpoint
-- Allowed values changed on existing columns: payments may now be paid by 'credit'; stock may move for a 'supplier_return'.
ALTER TABLE `supplier_payments` DROP CHECK `supplier_payments_method_check`;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_method_check` CHECK (`supplier_payments`.`method` IN ('cash', 'bank_transfer', 'cheque', 'credit'));--> statement-breakpoint
ALTER TABLE `stock_movements` DROP CHECK `stock_movements_reason_check`;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_reason_check` CHECK (`stock_movements`.`reason` IN ('opening', 'sale', 'void', 'received', 'adjustment', 'supplier_return'));
