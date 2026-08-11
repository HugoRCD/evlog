CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"verdict" text NOT NULL,
	"author" text NOT NULL,
	"text" text,
	"message_ref" text,
	"thread_ref" text,
	"session_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");