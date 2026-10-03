CREATE TABLE `instance` (
	`id` integer PRIMARY KEY NOT NULL,
	`session_secret` text NOT NULL,
	`owner_email` text,
	CONSTRAINT "instance_single_row" CHECK("instance"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`birth_date` text NOT NULL,
	`sex` text NOT NULL,
	`max_hr` integer,
	`height_cm` real,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profile_single_row" CHECK("profile"."id" = 1)
);
