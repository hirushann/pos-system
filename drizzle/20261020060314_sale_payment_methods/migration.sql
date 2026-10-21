ALTER TABLE `sales` ADD `payment_method` varchar(16) DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `cheque_number` varchar(64);--> statement-breakpoint
ALTER TABLE `sales` ADD `cheque_bank` varchar(255);--> statement-breakpoint
ALTER TABLE `sales` ADD `cheque_date` date;--> statement-breakpoint
ALTER TABLE `sales` ADD `cheque_status` varchar(16);--> statement-breakpoint
-- Existing sales: a card sale is one with no amount tendered
UPDATE `sales` SET `payment_method` = 'card' WHERE `amount_tendered` IS NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_payment_method_check` CHECK (`sales`.`payment_method` IN ('cash', 'card', 'cheque'));--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_cheque_check` CHECK ((`sales`.`payment_method` = 'cheque') = (`sales`.`cheque_status` IS NOT NULL) AND (`sales`.`cheque_status` IS NULL OR `sales`.`cheque_status` IN ('pending', 'cleared', 'bounced')));