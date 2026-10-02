CREATE TABLE `daily_metrics` (
	`day` text PRIMARY KEY NOT NULL,
	`hrv_ms` real,
	`hrv_deep_ms` real,
	`rhr_bpm` real,
	`rhr_method` text,
	`resp_bpm` real,
	`nightly_temp_c` real,
	`spo2_pct` real,
	`vo2max_daily` real,
	`vo2max_run` real,
	`steps` integer,
	`calories` real,
	`weight_kg` real,
	`body_fat_pct` real,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_scores` (
	`day` text PRIMARY KEY NOT NULL,
	`scoring_version` integer NOT NULL,
	`strain` text,
	`activities` text,
	`session_rhr_bpm` real,
	`recovery` text,
	`sleep` text,
	`training_load` text,
	`strain_target` text,
	`sleep_planner` text,
	`energy_bank` text,
	`stress` text,
	`health_monitor` text,
	`healthspan` text,
	`fitness` text,
	`journal_impact` text
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`type` text NOT NULL,
	`name` text,
	`calories` real,
	`distance_m` real,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercises_day` ON `exercises` (`day`);--> statement-breakpoint
CREATE TABLE `hr_samples` (
	`ts` integer PRIMARY KEY NOT NULL,
	`bpm` integer NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `intraday_dirty` (
	`day` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intraday_series` (
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`day`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`day` text NOT NULL,
	`tag` text NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`day`, `tag`)
);
--> statement-breakpoint
CREATE TABLE `journal_tags` (
	`tag` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scope` text NOT NULL,
	`revoked_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "oauth_tokens_single_row" CHECK("oauth_tokens"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `raw_payloads` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`range_start` integer NOT NULL,
	`range_end` integer NOT NULL,
	`body_hash` text NOT NULL,
	`gz_body` blob NOT NULL,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_payloads_dedupe` ON `raw_payloads` (`type`,`range_start`,`range_end`,`body_hash`);--> statement-breakpoint
CREATE TABLE `reports` (
	`period` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sleep_segments` (
	`session_id` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`stage` text NOT NULL,
	PRIMARY KEY(`session_id`, `start_ts`),
	FOREIGN KEY (`session_id`) REFERENCES `sleep_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sleep_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`start_ts` integer NOT NULL,
	`end_ts` integer NOT NULL,
	`is_main` integer NOT NULL,
	`processed` integer NOT NULL,
	`stages_status` text,
	`asleep_min` integer,
	`awake_min` integer,
	`deep_min` integer,
	`light_min` integer,
	`rem_min` integer,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sleep_sessions_day` ON `sleep_sessions` (`day`);--> statement-breakpoint
CREATE TABLE `steps_minutes` (
	`ts` integer PRIMARY KEY NOT NULL,
	`steps` integer NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`type` text PRIMARY KEY NOT NULL,
	`synced_through` integer,
	`backfill_days_done` integer,
	`backfill_days_total` integer,
	`last_attempt_at` integer,
	`last_success_at` integer,
	`last_error` text
);
