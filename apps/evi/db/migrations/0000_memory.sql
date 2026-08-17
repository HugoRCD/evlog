CREATE TABLE "identities" (
	"person_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"surface" text NOT NULL,
	"external_id" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"realm" text NOT NULL,
	"realm_key" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	"volatility" text DEFAULT 'durable' NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"supersedes" uuid,
	"source_kind" text NOT NULL,
	"source" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'visitor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "identities_tenant_id_surface_external_id_index" ON "identities" USING btree ("tenant_id","surface","external_id");--> statement-breakpoint
CREATE INDEX "identities_person_id_index" ON "identities" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memories_tenant_id_realm_realm_key_content_hash_index" ON "memories" USING btree ("tenant_id","realm","realm_key","content_hash");--> statement-breakpoint
CREATE INDEX "memories_tenant_id_realm_realm_key_invalidated_at_index" ON "memories" USING btree ("tenant_id","realm","realm_key","invalidated_at");--> statement-breakpoint
CREATE INDEX "memories_tenant_id_realm_realm_key_updated_at_index" ON "memories" USING btree ("tenant_id","realm","realm_key","updated_at" DESC NULLS LAST) WHERE invalidated_at is null;--> statement-breakpoint
CREATE INDEX "people_tenant_id_index" ON "people" USING btree ("tenant_id");