CREATE TABLE `supplier_invoices` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`supplier_id` bigint NOT NULL,
	`invoice_number` varchar(255) NOT NULL,
	`invoice_date` date NOT NULL,
	`due_date` date,
	`amount` decimal(12,2) NOT NULL,
	`notes` text,
	`created_by` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_invoices_supplier_number_unique` UNIQUE INDEX(`supplier_id`,`invoice_number`),
	CONSTRAINT `supplier_invoices_amount_check` CHECK(`supplier_invoices`.`amount` > 0)
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`invoice_id` bigint NOT NULL,
	`payment_date` date NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`method` varchar(32) NOT NULL,
	`reference` varchar(255),
	`cheque_number` varchar(64),
	`cheque_bank` varchar(255),
	`cheque_date` date,
	`cheque_status` varchar(16),
	`notes` text,
	`created_by` varchar(255),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_payments_amount_check` CHECK(`supplier_payments`.`amount` > 0),
	CONSTRAINT `supplier_payments_method_check` CHECK(`supplier_payments`.`method` IN ('cash', 'bank_transfer', 'cheque')),
	CONSTRAINT `supplier_payments_cheque_check` CHECK((`supplier_payments`.`method` = 'cheque') = (`supplier_payments`.`cheque_status` IS NOT NULL) AND (`supplier_payments`.`cheque_status` IS NULL OR `supplier_payments`.`cheque_status` IN ('pending', 'cleared', 'bounced')))
);
--> statement-breakpoint
CREATE TABLE `supplier_price_items` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`supplier_id` bigint NOT NULL,
	`item_name` varchar(255) NOT NULL,
	`part_number` varchar(255),
	`unit_price` decimal(12,2) NOT NULL,
	`price_date` date NOT NULL,
	`notes` varchar(500),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `supplier_price_items_price_check` CHECK(`supplier_price_items`.`unit_price` >= 0)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` bigint AUTO_INCREMENT PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`contact_person` varchar(255),
	`phone` varchar(255),
	`email` varchar(255),
	`address` varchar(500),
	`payment_terms_days` int NOT NULL DEFAULT 0,
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `name_unique` UNIQUE INDEX(`name`),
	CONSTRAINT `suppliers_terms_check` CHECK(`suppliers`.`payment_terms_days` >= 0)
);
--> statement-breakpoint
CREATE INDEX `supplier_invoices_supplier_id_idx` ON `supplier_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `supplier_invoices_due_date_idx` ON `supplier_invoices` (`due_date`);--> statement-breakpoint
CREATE INDEX `supplier_payments_invoice_id_idx` ON `supplier_payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_date_idx` ON `supplier_payments` (`payment_date`);--> statement-breakpoint
CREATE INDEX `supplier_price_items_supplier_id_idx` ON `supplier_price_items` (`supplier_id`);--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_supplier_id_suppliers_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD CONSTRAINT `supplier_invoices_created_by_user_id_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_invoice_id_supplier_invoices_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `supplier_invoices`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_created_by_user_id_fkey` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`);--> statement-breakpoint
ALTER TABLE `supplier_price_items` ADD CONSTRAINT `supplier_price_items_supplier_id_suppliers_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE;