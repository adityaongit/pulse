ALTER TABLE `journal_tags` ADD `hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_tags` ADD `position` integer DEFAULT 0 NOT NULL;