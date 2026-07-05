ALTER TABLE `devices` ADD `device_name` varchar(255);--> statement-breakpoint
ALTER TABLE `devices` ADD `user_agent` text;--> statement-breakpoint
ALTER TABLE `devices` ADD `ip_address` varchar(45);--> statement-breakpoint
ALTER TABLE `devices` ADD `is_trusted` boolean DEFAULT false;