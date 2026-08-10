CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(160) NOT NULL,
	"region" text NOT NULL,
	"description" text NOT NULL,
	"image_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_destinations" (
	"product_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "product_destinations_pkey" PRIMARY KEY("product_id","destination_id")
);
--> statement-breakpoint
ALTER TABLE "product_destinations" ADD CONSTRAINT "product_destinations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_destinations" ADD CONSTRAINT "product_destinations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "destinations_active_sort_idx" ON "destinations" USING btree ("is_active","sort_order");
--> statement-breakpoint
CREATE INDEX "product_destinations_destination_sort_idx" ON "product_destinations" USING btree ("destination_id","sort_order");
