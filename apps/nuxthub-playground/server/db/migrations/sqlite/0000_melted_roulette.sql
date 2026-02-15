CREATE TABLE `evlog_events` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`level` text NOT NULL,
	`service` text NOT NULL,
	`environment` text NOT NULL,
	`method` text,
	`path` text,
	`status` integer,
	`duration_ms` integer,
	`request_id` text,
	`source` text,
	`error` text,
	`data` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evlog_events_timestamp_idx` ON `evlog_events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `evlog_events_level_idx` ON `evlog_events` (`level`);--> statement-breakpoint
CREATE INDEX `evlog_events_service_idx` ON `evlog_events` (`service`);--> statement-breakpoint
CREATE INDEX `evlog_events_status_idx` ON `evlog_events` (`status`);--> statement-breakpoint
CREATE INDEX `evlog_events_request_id_idx` ON `evlog_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `evlog_events_created_at_idx` ON `evlog_events` (`created_at`);