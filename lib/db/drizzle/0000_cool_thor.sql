CREATE TYPE "public"."conv_status" AS ENUM('active', 'pending', 'closed');--> statement-breakpoint
CREATE TYPE "public"."key_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."key_type" AS ENUM('chat', 'embedding');--> statement-breakpoint
CREATE TYPE "public"."msg_from" AS ENUM('customer', 'agent');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'pending_payment', 'pending_review', 'approved', 'rejected', 'delivered', 'cancelled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('pending_review', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."wa_status" AS ENUM('connected', 'disconnected', 'error', 'idle');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "key_type" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"api_key" text NOT NULL,
	"status" "key_status" DEFAULT 'active' NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"requests_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "broadcast_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"message" text NOT NULL,
	"segments" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text,
	"description" text,
	"store_url" text,
	"phones" text,
	"branches" text,
	"social_links" text,
	"bank_accounts" text,
	"working_hours" text,
	"return_policy" text,
	"logo_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_name" text,
	"status" "conv_status" DEFAULT 'active' NOT NULL,
	"last_message" text,
	"agent_paused" boolean DEFAULT false NOT NULL,
	"sent_image_product_ids" text DEFAULT '[]' NOT NULL,
	"is_group" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'percent' NOT NULL,
	"value" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"products" text DEFAULT 'الكل' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"customer_phone" text NOT NULL,
	"detected_name" text,
	"city" text,
	"is_buyer" boolean DEFAULT false NOT NULL,
	"product_preferences" text[] DEFAULT '{}' NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"free_delivery_all" boolean DEFAULT false NOT NULL,
	"unknown_location_policy" text DEFAULT 'unavailable' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_zone_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"unit" text NOT NULL,
	"cost" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"min_order" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"ref_id" text NOT NULL,
	"content" text NOT NULL,
	"embedding" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"from" "msg_from" NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "omqi_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"order_id" integer,
	"receipt_number" text NOT NULL,
	"dest_account" text,
	"dest_name" text,
	"source_name" text,
	"amount" text,
	"currency" text,
	"receipt_date" text,
	"file_size_kb" text,
	"confidence" integer,
	"verified_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"conversation_id" integer,
	"sender_phone" text DEFAULT '' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_address" text,
	"items" text NOT NULL,
	"subtotal" text DEFAULT '0' NOT NULL,
	"delivery_cost" text DEFAULT '0' NOT NULL,
	"total" text DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"notes" text,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"deposit_reference" text,
	"deposit_media_url" text,
	"review_sent_at" timestamp,
	"followup_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit" text DEFAULT 'قطعة' NOT NULL,
	"price" text NOT NULL,
	"negotiation_price" text,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"image_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"conversation_id" integer,
	"sender_phone" text,
	"order_id" text,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"reason" text NOT NULL,
	"items" text NOT NULL,
	"status" "return_status" DEFAULT 'pending_review' NOT NULL,
	"admin_notes" text,
	"review_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"chat_key_id" integer,
	"embedding_key_id" integer,
	"agent_enabled" boolean DEFAULT true NOT NULL,
	"system_prompt" text,
	"currency" text DEFAULT 'SAR' NOT NULL,
	"dialect" text DEFAULT 'saudi' NOT NULL,
	"dialect_strength" integer DEFAULT 5 NOT NULL,
	"style" text DEFAULT 'friendly' NOT NULL,
	"tone" text DEFAULT 'warm' NOT NULL,
	"persuasion" integer DEFAULT 7 NOT NULL,
	"formality" integer DEFAULT 5 NOT NULL,
	"response_delay" integer DEFAULT 3 NOT NULL,
	"emoji_level" text DEFAULT 'medium' NOT NULL,
	"reply_length" text DEFAULT 'medium' NOT NULL,
	"opening_message" text,
	"closing_message" text,
	"strat_followup" boolean DEFAULT true NOT NULL,
	"strat_cart" boolean DEFAULT true NOT NULL,
	"strat_upsell" boolean DEFAULT true NOT NULL,
	"strat_promo" boolean DEFAULT true NOT NULL,
	"strat_review" boolean DEFAULT true NOT NULL,
	"send_product_images" boolean DEFAULT true NOT NULL,
	"order_system_enabled" boolean DEFAULT true NOT NULL,
	"review_whatsapp_number" text,
	"approved_order_message" text,
	"delivered_order_message" text,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"deposit_tolerance" integer DEFAULT 5 NOT NULL,
	"invoice_color" text DEFAULT '#16a34a' NOT NULL,
	"invoice_enabled" boolean DEFAULT true NOT NULL,
	"omqi_verification_enabled" boolean DEFAULT true NOT NULL,
	"chat_fallback_key_ids" text DEFAULT '[]' NOT NULL,
	"message_aggregation_delay" integer DEFAULT 15 NOT NULL,
	"group_reply_mode" text DEFAULT 'disabled' NOT NULL,
	"allowed_group_ids" text DEFAULT '[]' NOT NULL,
	"return_system_enabled" boolean DEFAULT true NOT NULL,
	"max_tokens" integer DEFAULT 1500 NOT NULL,
	"report_enabled" boolean DEFAULT false NOT NULL,
	"report_frequency" text DEFAULT 'daily' NOT NULL,
	"report_time" text DEFAULT '08:00' NOT NULL,
	"report_manager_phone" text,
	"last_daily_report_at" timestamp,
	"last_weekly_report_at" timestamp,
	"last_monthly_report_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider" text DEFAULT 'evolution' NOT NULL,
	"base_url" text,
	"api_key" text,
	"instance_name" text,
	"config" text,
	"status" "wa_status" DEFAULT 'idle' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zone_rates" ADD CONSTRAINT "delivery_zone_rates_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omqi_receipts" ADD CONSTRAINT "omqi_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "omqi_receipts" ADD CONSTRAINT "omqi_receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_chat_key_id_api_keys_id_fk" FOREIGN KEY ("chat_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_embedding_key_id_api_keys_id_fk" FOREIGN KEY ("embedding_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cp_user_phone_idx" ON "customer_profiles" USING btree ("user_id","customer_phone");--> statement-breakpoint
CREATE UNIQUE INDEX "kc_user_type_ref_idx" ON "knowledge_chunks" USING btree ("user_id","type","ref_id");