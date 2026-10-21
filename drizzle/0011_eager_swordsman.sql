CREATE TABLE "mcp_oauth_access_tokens" (
	"user_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"resource" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "mcp_oauth_access_tokens_user_id_token_hash_pk" PRIMARY KEY("user_id","token_hash"),
	CONSTRAINT "mcp_oauth_access_tokens_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_codes" (
	"user_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"resource" text NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "mcp_oauth_codes_user_id_code_hash_pk" PRIMARY KEY("user_id","code_hash"),
	CONSTRAINT "mcp_oauth_codes_hash" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_grants" (
	"user_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	CONSTRAINT "mcp_oauth_grants_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_refresh_tokens" (
	"user_id" integer NOT NULL,
	"client_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"resource" text NOT NULL,
	CONSTRAINT "mcp_oauth_refresh_tokens_user_id_token_hash_pk" PRIMARY KEY("user_id","token_hash"),
	CONSTRAINT "mcp_oauth_refresh_tokens_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
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
ALTER TABLE "mcp_oauth_access_tokens" ADD CONSTRAINT "mcp_oauth_access_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_access_tokens" ADD CONSTRAINT "mcp_oauth_access_tokens_user_id_client_id_mcp_oauth_grants_user_id_client_id_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."mcp_oauth_grants"("user_id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_codes" ADD CONSTRAINT "mcp_oauth_codes_user_id_client_id_mcp_oauth_grants_user_id_client_id_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."mcp_oauth_grants"("user_id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_grants" ADD CONSTRAINT "mcp_oauth_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_user_id_client_id_mcp_oauth_grants_user_id_client_id_fk" FOREIGN KEY ("user_id","client_id") REFERENCES "public"."mcp_oauth_grants"("user_id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;