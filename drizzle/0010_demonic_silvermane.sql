CREATE TABLE "mcp_tokens" (
	"user_id" integer NOT NULL,
	"id" serial NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" bigint NOT NULL,
	"last_used_at" bigint,
	CONSTRAINT "mcp_tokens_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "mcp_tokens_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;