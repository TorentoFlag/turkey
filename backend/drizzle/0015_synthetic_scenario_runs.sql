CREATE TYPE "public"."synthetic_scenario_run_state" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "synthetic_scenario_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"site_id" uuid NOT NULL,
	"scenario_key" varchar(128) NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"state" "synthetic_scenario_run_state" NOT NULL,
	"order_id" uuid,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "synthetic_scenario_runs" ADD CONSTRAINT "synthetic_scenario_runs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "synthetic_scenario_runs_identity_idx" ON "synthetic_scenario_runs" USING btree ("id","site_id","scenario_key");--> statement-breakpoint
CREATE INDEX "synthetic_scenario_runs_site_created_idx" ON "synthetic_scenario_runs" USING btree ("site_id","created_at");