ALTER TABLE `products` ADD `preferred_supplier_id` bigint;--> statement-breakpoint
CREATE INDEX `products_preferred_supplier_idx` ON `products` (`preferred_supplier_id`);--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_preferred_supplier_id_suppliers_id_fkey` FOREIGN KEY (`preferred_supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL;