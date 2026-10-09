CREATE TABLE "fold_checkpoints" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"scoring_version" integer NOT NULL,
	"inputs_key" text NOT NULL,
	"fold" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hr_days" ADD COLUMN "minute" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fold_checkpoints" ADD CONSTRAINT "fold_checkpoints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;