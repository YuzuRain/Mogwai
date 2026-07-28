CREATE TABLE "provider_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_dek" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"model_whitelist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending_verify' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_status_check" CHECK ("provider_keys"."status" in ('pending_verify', 'active', 'throttled', 'invalid', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL,
	"privacy_mode" boolean DEFAULT false NOT NULL,
	"pledge_limit_cp" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "config_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"namespace" text NOT NULL,
	"version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"gray_ratio" real,
	"effective_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_status_check" CHECK ("config_versions"."status" in ('draft', 'gray', 'active', 'retired'))
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"txn_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"user_id" text NOT NULL,
	"account" text NOT NULL,
	"counterparty_id" text NOT NULL,
	"delta_cp" bigint NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"formula_version" text,
	"snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_check" CHECK ("ledger_entries"."account" in ('pledge', 'debt', 'service_fee')),
	CONSTRAINT "ledger_delta_nonzero" CHECK ("ledger_entries"."delta_cp" <> 0)
);
--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_counterparty_id_users_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_keys_user_idx" ON "provider_keys" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "config_namespace_version_uq" ON "config_versions" USING btree ("namespace","version");--> statement-breakpoint
CREATE UNIQUE INDEX "config_single_active_uq" ON "config_versions" USING btree ("namespace") WHERE "config_versions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_event_seq_uq" ON "ledger_entries" USING btree ("event_id","seq");--> statement-breakpoint
CREATE INDEX "ledger_txn_idx" ON "ledger_entries" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "ledger_user_account_idx" ON "ledger_entries" USING btree ("user_id","account");