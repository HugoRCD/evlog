CREATE TABLE "runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"tool_name" text NOT NULL,
	"tool_version" text NOT NULL,
	"command" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"error_code" text,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"env_node" text NOT NULL,
	"env_ci" boolean NOT NULL,
	"env_provider" text,
	"env_tty" boolean NOT NULL,
	"env_agent" text,
	"environment" text NOT NULL,
	"machine_id" text,
	"event_timestamp" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "runs_event_timestamp_idx" ON "runs" USING btree ("event_timestamp" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_tool_name_idx" ON "runs" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "runs_environment_idx" ON "runs" USING btree ("environment");