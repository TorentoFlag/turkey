CREATE TYPE "public"."catalog_protocol_operation_state" AS ENUM('in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "catalog_protocol_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_key" varchar(128) NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"request_id" uuid NOT NULL,
	"method" varchar(10) NOT NULL,
	"path" text NOT NULL,
	"state" "catalog_protocol_operation_state" NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalog_protocol_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_key" varchar(128) NOT NULL,
	"actor_id" varchar(128) NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" varchar(255) NOT NULL,
	"byte_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_purgeable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "catalog_protocol_operations_site_idempotency_idx" ON "catalog_protocol_operations" USING btree ("site_key","idempotency_key");--> statement-breakpoint
CREATE INDEX "catalog_protocol_operations_site_operation_idx" ON "catalog_protocol_operations" USING btree ("site_key","id");--> statement-breakpoint
CREATE INDEX "catalog_protocol_uploads_site_expiry_idx" ON "catalog_protocol_uploads" USING btree ("site_key","expires_at");