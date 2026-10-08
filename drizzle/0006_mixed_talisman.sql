CREATE TABLE "journal_notes" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "journal_notes_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "detail" integer;--> statement-breakpoint
ALTER TABLE "journal_notes" ADD CONSTRAINT "journal_notes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;