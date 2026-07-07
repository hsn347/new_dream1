import { pgTable, serial, text, timestamp, integer, boolean, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const userStatusEnum = pgEnum("user_status", ["active", "pending", "disabled"]);
export const keyTypeEnum = pgEnum("key_type", ["chat", "embedding"]);
export const keyStatusEnum = pgEnum("key_status", ["active", "disabled"]);
export const waStatusEnum = pgEnum("wa_status", ["connected", "disconnected", "error", "idle"]);
export const convStatusEnum = pgEnum("conv_status", ["active", "pending", "closed"]);
export const msgFromEnum = pgEnum("msg_from", ["customer", "agent"]);
export const orderStatusEnum = pgEnum("order_status", ["draft", "pending_payment", "pending_review", "approved", "rejected", "delivered", "cancelled", "returned"]);
export const returnStatusEnum = pgEnum("return_status", ["pending_review", "approved", "rejected", "completed"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").default("user").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: keyTypeEnum("type").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  apiKey: text("api_key").notNull(),
  status: keyStatusEnum("status").default("active").notNull(),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  requestsCount: integer("requests_count").default(0).notNull(),
  avgLatencyMs: integer("avg_latency_ms").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const whatsappConnectionsTable = pgTable("whatsapp_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull().unique(),
  provider: text("provider").default("evolution").notNull(),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  instanceName: text("instance_name"),
  config: text("config"),
  status: waStatusEnum("status").default("idle").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userSettingsTable = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull().unique(),
  chatKeyId: integer("chat_key_id").references(() => apiKeysTable.id),
  embeddingKeyId: integer("embedding_key_id").references(() => apiKeysTable.id),
  agentEnabled: boolean("agent_enabled").default(true).notNull(),
  systemPrompt: text("system_prompt"),
  // Business currency (unified for all products/orders)
  currency: text("currency").default("SAR").notNull(),
  // Agent behavior settings
  dialect: text("dialect").default("saudi").notNull(),
  dialectStrength: integer("dialect_strength").default(5).notNull(),
  style: text("style").default("friendly").notNull(),
  tone: text("tone").default("warm").notNull(),
  persuasion: integer("persuasion").default(7).notNull(),
  formality: integer("formality").default(5).notNull(),
  responseDelay: integer("response_delay").default(3).notNull(),
  emojiLevel: text("emoji_level").default("medium").notNull(),
  replyLength: text("reply_length").default("medium").notNull(),
  openingMessage: text("opening_message"),
  closingMessage: text("closing_message"),
  stratFollowup: boolean("strat_followup").default(true).notNull(),
  stratCart: boolean("strat_cart").default(true).notNull(),
  stratUpsell: boolean("strat_upsell").default(true).notNull(),
  stratPromo: boolean("strat_promo").default(true).notNull(),
  stratReview: boolean("strat_review").default(true).notNull(),
  sendProductImages: boolean("send_product_images").default(true).notNull(),
  // Order system
  orderSystemEnabled: boolean("order_system_enabled").default(true).notNull(),
  reviewWhatsappNumber: text("review_whatsapp_number"),
  approvedOrderMessage: text("approved_order_message"),
  deliveredOrderMessage: text("delivered_order_message"),
  lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
  depositTolerance: integer("deposit_tolerance").default(5).notNull(),
  // Invoice settings
  invoiceColor: text("invoice_color").default("#16a34a").notNull(),
  invoiceEnabled: boolean("invoice_enabled").default(true).notNull(),
  // Omqi verification toggle
  omqiVerificationEnabled: boolean("omqi_verification_enabled").default(true).notNull(),
  chatFallbackKeyIds: text("chat_fallback_key_ids").default("[]").notNull(),
  messageAggregationDelay: integer("message_aggregation_delay").default(15).notNull(),
  // Group reply settings
  groupReplyMode: text("group_reply_mode").default("disabled").notNull(),
  allowedGroupIds: text("allowed_group_ids").default("[]").notNull(),
  // Agent tool controls
  returnSystemEnabled: boolean("return_system_enabled").default(true).notNull(),
  maxTokens: integer("max_tokens").default(1500).notNull(),
  // Scheduled reports
  reportEnabled: boolean("report_enabled").default(false).notNull(),
  reportFrequency: text("report_frequency").default("daily").notNull(),
  reportTime: text("report_time").default("08:00").notNull(),
  reportManagerPhone: text("report_manager_phone"),
  lastDailyReportAt: timestamp("last_daily_report_at"),
  lastWeeklyReportAt: timestamp("last_weekly_report_at"),
  lastMonthlyReportAt: timestamp("last_monthly_report_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerName: text("customer_name"),
  status: convStatusEnum("status").default("active").notNull(),
  lastMessage: text("last_message"),
  agentPaused: boolean("agent_paused").default(false).notNull(),
  sentImageProductIds: text("sent_image_product_ids").default("[]").notNull(),
  isGroup: boolean("is_group").default(false).notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id).notNull(),
  from: msgFromEnum("from").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  senderPhone: text("sender_phone").notNull().default(""),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  items: text("items").notNull(),
  subtotal: text("subtotal").default("0").notNull(),
  deliveryCost: text("delivery_cost").default("0").notNull(),
  total: text("total").default("0").notNull(),
  currency: text("currency").default("SAR").notNull(),
  notes: text("notes"),
  status: orderStatusEnum("status").default("draft").notNull(),
  depositReference: text("deposit_reference"),
  depositMediaUrl: text("deposit_media_url"),
  reviewSentAt: timestamp("review_sent_at"),
  followupSentAt: timestamp("followup_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  qty: integer("qty").default(0).notNull(),
  unit: text("unit").default("قطعة").notNull(),
  price: text("price").notNull(),
  negotiationPrice: text("negotiation_price"),
  currency: text("currency").default("SAR").notNull(),
  imageUrl: text("image_url"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  code: text("code").notNull(),
  type: text("type").default("percent").notNull(),
  value: text("value").notNull(),
  startDate: text("start_date"),
  endDate: text("end_date"),
  products: text("products").default("الكل").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull().unique(),
  name: text("name"),
  description: text("description"),
  storeUrl: text("store_url"),
  phones: text("phones"),
  branches: text("branches"),
  socialLinks: text("social_links"),
  bankAccounts: text("bank_accounts"),
  workingHours: text("working_hours"),
  returnPolicy: text("return_policy"),
  logoUrl: text("logo_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const returnsTable = pgTable("returns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id),
  senderPhone: text("sender_phone"),
  orderId: text("order_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  reason: text("reason").notNull(),
  items: text("items").notNull(),
  status: returnStatusEnum("status").default("pending_review").notNull(),
  adminNotes: text("admin_notes"),
  reviewSentAt: timestamp("review_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const knowledgeEntriesTable = pgTable("knowledge_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  type: text("type").default("custom").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const deliveryZonesTable = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  name: text("name").notNull(),
  minOrder: text("min_order").default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const deliveryZoneRatesTable = pgTable("delivery_zone_rates", {
  id: serial("id").primaryKey(),
  zoneId: integer("zone_id").references(() => deliveryZonesTable.id, { onDelete: "cascade" }).notNull(),
  unit: text("unit").notNull(),
  cost: text("cost").notNull(),
});

export const deliverySettingsTable = pgTable("delivery_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull().unique(),
  freeDeliveryAll: boolean("free_delivery_all").default(false).notNull(),
  unknownLocationPolicy: text("unknown_location_policy").default("unavailable").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customerProfilesTable = pgTable(
  "customer_profiles",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id).notNull(),
    customerPhone: text("customer_phone").notNull(),
    detectedName: text("detected_name"),
    city: text("city"),
    isBuyer: boolean("is_buyer").default(false).notNull(),
    inquiredProducts: text("product_preferences").array().default([]).notNull(),
    totalOrders: integer("total_orders").default(0).notNull(),
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("cp_user_phone_idx").on(t.userId, t.customerPhone)],
);

export const broadcastCampaignsTable = pgTable("broadcast_campaigns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  message: text("message").notNull(),
  segments: text("segments").notNull(),
  recipientCount: integer("recipient_count").default(0).notNull(),
  sentCount: integer("sent_count").default(0).notNull(),
  failedCount: integer("failed_count").default(0).notNull(),
  status: text("status").default("pending").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link"),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledgeChunksTable = pgTable(
  "knowledge_chunks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id).notNull(),
    type: text("type").notNull(),
    refId: text("ref_id").notNull(),
    content: text("content").notNull(),
    embedding: text("embedding").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("kc_user_type_ref_idx").on(t.userId, t.type, t.refId)],
);

export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const omqiReceiptsTable = pgTable("omqi_receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  orderId: integer("order_id").references(() => ordersTable.id),
  receiptNumber: text("receipt_number").notNull(),
  destAccount: text("dest_account"),
  destName: text("dest_name"),
  sourceName: text("source_name"),
  amount: text("amount"),
  currency: text("currency"),
  receiptDate: text("receipt_date"),
  fileSizeKb: text("file_size_kb"),
  confidence: integer("confidence"),
  verifiedAt: timestamp("verified_at").defaultNow().notNull(),
});
