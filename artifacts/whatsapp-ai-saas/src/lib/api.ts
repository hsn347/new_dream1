const API_BASE = "https://new-dream1-1.onrender.com/api";

const inMemoryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 15; // 15 minutes (was 5)

// Map of write endpoints to which read caches they should invalidate
const INVALIDATION_MAP: Record<string, string[]> = {
  "/admin/keys":       ["/admin/keys"],
  "/admin/users":      ["/admin/users", "/user/dashboard"],
  "/admin/settings":   ["/admin/settings"],
  "/admin/admins":     ["/admin/admins"],
  "/user/products":    ["/user/products", "/user/dashboard"],
  "/user/coupons":     ["/user/coupons"],
  "/user/business":    ["/user/business"],
  "/user/knowledge":   ["/user/knowledge"],
  "/user/delivery":    ["/user/delivery"],
  "/user/orders":      ["/user/orders", "/user/dashboard"],
  "/user/returns":     ["/user/returns", "/user/dashboard"],
  "/user/customers":   ["/user/customers"],
  "/user/broadcast":   ["/user/broadcast"],
  "/user/settings":    ["/user/settings"],
  "/user/whatsapp":    ["/user/settings"],
  "/user/notifications": ["/user/notifications"],
};

function invalidateRelatedCache(path: string) {
  // Find the base path (remove IDs)
  const basePath = path.replace(/\/\d+/g, "").split("?")[0];
  
  // Find matching invalidation rules
  let invalidated = false;
  for (const [pattern, targets] of Object.entries(INVALIDATION_MAP)) {
    if (basePath.startsWith(pattern) || basePath === pattern) {
      for (const target of targets) {
        // Remove all cache entries starting with this target
        for (const key of inMemoryCache.keys()) {
          if (key.includes(target)) inMemoryCache.delete(key);
        }
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith("apiCache:") && k.includes(target)) keysToRemove.push(k);
          }
          keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch {}
      }
      invalidated = true;
      break;
    }
  }
  
  // Fallback: if no matching rule, clear everything
  if (!invalidated) {
    inMemoryCache.clear();
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("apiCache:")) keysToRemove.push(key);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method || "GET";
  const isGet = method === "GET";
  const shouldCache = isGet && path !== "/auth/me";
  const cacheKey = shouldCache ? `apiCache:${path}` : null;

  if (isGet && cacheKey) {
    let cached = inMemoryCache.get(cacheKey);
    if (!cached) {
      try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) cached = JSON.parse(stored);
      } catch { }
    }

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      inMemoryCache.set(cacheKey, cached);
      return cached.data as T;
    }
  }


  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }

  if (res.status === 204) return undefined as unknown as T;

  const data = await res.json();

  if (isGet && cacheKey) {
    const cacheObj = { data, timestamp: Date.now() };
    inMemoryCache.set(cacheKey, cacheObj);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheObj));
    } catch { }
  } else if (!isGet) {
    // Smart cache invalidation: only clear caches related to the mutated endpoint
    invalidateRelatedCache(path);
  }

  return data as T;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ id: number; name: string; email: string; role: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    me: () =>
      apiFetch<{ id: number; name: string; email: string; role: string } | null>("/auth/me"),
  },

  keys: {
    list: () => apiFetch<ApiKey[]>("/admin/keys"),
    create: (data: CreateKeyPayload) =>
      apiFetch<ApiKey>("/admin/keys", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, unknown>) =>
      apiFetch<ApiKey>(`/admin/keys/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) =>
      apiFetch<void>(`/admin/keys/${id}`, { method: "DELETE" }),
    test: (id: number) =>
      apiFetch<{ success: boolean; message: string; latencyMs?: number }>(`/admin/keys/${id}/test`, {
        method: "POST",
      }),
  },

  users: {
    list: () => apiFetch<AdminUser[]>("/admin/users"),
    create: (data: CreateUserPayload) =>
      apiFetch<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify(data) }),
    get: (id: number) => apiFetch<AdminUser>(`/admin/users/${id}`),
    update: (id: number, data: Record<string, unknown>) =>
      apiFetch<void>(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE" }),
  },

  admins: {
    list: () => apiFetch<any[]>("/admin/admins"),
    create: (data: { name: string; email: string; password: string; phone?: string }) =>
      apiFetch<any>("/admin/admins", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Record<string, string>) =>
      apiFetch<{ ok: boolean }>(`/admin/admins/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: number) =>
      apiFetch<{ ok: boolean }>(`/admin/admins/${id}`, { method: "DELETE" }),
  },

  adminSettings: {
    get: () => apiFetch<Record<string, string>>("/admin/settings"),
    update: (data: Record<string, string>) =>
      apiFetch<{ ok: boolean }>("/admin/settings", { method: "PUT", body: JSON.stringify(data) }),
    testWhatsapp: (number: string) =>
      apiFetch<{ success: boolean; message: string }>("/admin/settings/test-whatsapp", {
        method: "POST",
        body: JSON.stringify({ number }),
      }),
  },

  admin: {
    saveWhatsApp: (userId: number, data: WAConfig) =>
      apiFetch<void>(`/admin/users/${userId}/whatsapp`, { method: "PUT", body: JSON.stringify(data) }),
    testWhatsApp: (userId: number) =>
      apiFetch<{ success: boolean; message: string; state?: string }>(`/admin/users/${userId}/whatsapp/test`, {
        method: "POST",
      }),
    createInstance: (userId: number, webhookUrl: string) =>
      apiFetch<{ success: boolean; message: string; alreadyExists?: boolean }>(`/admin/users/${userId}/whatsapp/create-instance`, {
        method: "POST",
        body: JSON.stringify({ webhookUrl }),
      }),
    getQr: (userId: number) =>
      apiFetch<{ success: boolean; qrCode?: string; message: string; state?: string }>(`/admin/users/${userId}/whatsapp/qr`),
    getState: (userId: number) =>
      apiFetch<{ success: boolean; message: string; state?: string }>(`/admin/users/${userId}/whatsapp/state`),
    setWebhook: (userId: number, webhookUrl: string) =>
      apiFetch<{ success: boolean; message: string }>(`/admin/users/${userId}/whatsapp/set-webhook`, {
        method: "POST",
        body: JSON.stringify({ webhookUrl }),
      }),
  },

  user: {
    dashboard: () => apiFetch<DashboardStats>("/user/dashboard"),
    conversations: () => apiFetch<Conversation[]>("/user/conversations"),
    pauseConversation: (id: number, paused: boolean) =>
      apiFetch<{ ok: boolean; paused: boolean }>(`/user/conversations/${id}/pause`, {
        method: "PATCH",
        body: JSON.stringify({ paused }),
      }),
    messages: (convId: number) => apiFetch<Message[]>(`/user/conversations/${convId}/messages`),
    clearMessages: (convId: number) =>
      apiFetch<{ ok: boolean }>(`/user/conversations/${convId}/messages`, { method: "DELETE" }),
    sendMessage: (convId: number, text: string) =>
      apiFetch<Message>(`/user/conversations/${convId}/send`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    settings: () => apiFetch<UserSettings>("/user/settings"),
    updateSettings: (data: Partial<UserSettings>) =>
      apiFetch<void>("/user/settings", { method: "PUT", body: JSON.stringify(data) }),
    groups: () => apiFetch<GroupConversation[]>("/user/groups"),
    updateWhatsApp: (data: WAConfig) =>
      apiFetch<void>("/user/whatsapp", { method: "PUT", body: JSON.stringify(data) }),
    testWhatsApp: () =>
      apiFetch<{ success: boolean; message: string }>("/user/whatsapp/test", { method: "POST" }),
    keys: () => apiFetch<Pick<ApiKey, "id" | "name" | "type" | "provider" | "model">[]>("/user/keys"),

    products: {
      list: (params?: { page?: number; limit?: number; q?: string; status?: string; threshold?: number }) => {
        const p = new URLSearchParams();
        if (params?.page) p.set("page", String(params.page));
        if (params?.limit) p.set("limit", String(params.limit));
        if (params?.q) p.set("q", params.q);
        if (params?.status) p.set("status", params.status);
        if (params?.threshold !== undefined) p.set("threshold", String(params.threshold));
        const qs = p.toString();
        return apiFetch<{ items: Product[]; total: number; counts: { active: number; inactive: number; low_stock: number } }>(
          `/user/products${qs ? "?" + qs : ""}`,
        );
      },
      create: (data: ProductPayload) =>
        apiFetch<Product>("/user/products", { method: "POST", body: JSON.stringify(data) }),
      update: (id: number, data: Partial<ProductPayload>) =>
        apiFetch<Product>(`/user/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/products/${id}`, { method: "DELETE" }),
      uploadImage: (id: number, data: string, mimeType: string) =>
        apiFetch<{ imageUrl: string }>(`/user/products/${id}/image`, {
          method: "POST",
          body: JSON.stringify({ data, mimeType }),
        }),
      importExcel: (data: string) =>
        apiFetch<{ imported: number; skipped: number; errors: string[] }>("/user/products/import", {
          method: "POST",
          body: JSON.stringify({ data }),
        }),
      addStock: (id: number, add: number) =>
        apiFetch<Product>(`/user/products/${id}/stock`, {
          method: "PATCH",
          body: JSON.stringify({ add }),
        }),
    },

    coupons: {
      list: () => apiFetch<Coupon[]>("/user/coupons"),
      create: (data: CouponPayload) =>
        apiFetch<Coupon>("/user/coupons", { method: "POST", body: JSON.stringify(data) }),
      update: (id: number, data: Partial<CouponPayload>) =>
        apiFetch<Coupon>(`/user/coupons/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/coupons/${id}`, { method: "DELETE" }),
    },

    business: {
      get: () => apiFetch<Business>("/user/business"),
      save: (data: Business) =>
        apiFetch<{ ok: boolean }>("/user/business", { method: "PUT", body: JSON.stringify(data) }),
      uploadLogo: async (file: File): Promise<{ ok: boolean; logoUrl: string }> => {
        const form = new FormData();
        form.append("logo", file);
        const res = await fetch(`${API_BASE}/user/business/logo`, {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: res.statusText }));
          throw new Error((err as { message?: string }).message || res.statusText);
        }
        return res.json();
      },
    },

    knowledge: {
      list: () => apiFetch<KnowledgeEntry[]>("/user/knowledge"),
      create: (data: KnowledgeEntryPayload) =>
        apiFetch<KnowledgeEntry>("/user/knowledge", { method: "POST", body: JSON.stringify(data) }),
      update: (id: number, data: Partial<KnowledgeEntryPayload>) =>
        apiFetch<KnowledgeEntry>(`/user/knowledge/${id}`, { method: "PUT", body: JSON.stringify(data) }),
      remove: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/knowledge/${id}`, { method: "DELETE" }),
      bulk: (entries: KnowledgeEntryPayload[]) =>
        apiFetch<KnowledgeEntry[]>("/user/knowledge/bulk", { method: "POST", body: JSON.stringify({ entries }) }),
    },

    orders: {
      list: () => apiFetch<any[]>("/user/orders"),
      get: (id: number) => apiFetch<any>(`/user/orders/${id}`),
      updateStatus: (id: number, status: string) =>
        apiFetch<{ ok: boolean }>(`/user/orders/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      updateNotes: (id: number, notes: string) =>
        apiFetch<{ ok: boolean }>(`/user/orders/${id}/notes`, {
          method: "PATCH",
          body: JSON.stringify({ notes }),
        }),
      deleteArchive: () =>
        apiFetch<{ ok: boolean }>("/user/orders/archive", { method: "DELETE" }),
    },

    returns: {
      list: () => apiFetch<Return[]>("/user/returns"),
      create: (data: Partial<Return>) =>
        apiFetch<Return>("/user/returns", { method: "POST", body: JSON.stringify(data) }),
      updateStatus: (id: number, status: string) =>
        apiFetch<{ ok: boolean }>(`/user/returns/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      updateNotes: (id: number, notes: string) =>
        apiFetch<{ ok: boolean }>(`/user/returns/${id}/notes`, {
          method: "PATCH",
          body: JSON.stringify({ notes }),
        }),
      delete: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/returns/${id}`, { method: "DELETE" }),
    },

    customers: {
      list: () => apiFetch<CustomerProfile[]>("/user/customers"),
      get: (phone: string) => apiFetch<CustomerProfile | null>(`/user/customers/${encodeURIComponent(phone)}`),
      update: (phone: string, data: Partial<CustomerProfilePayload>) =>
        apiFetch<{ ok: boolean }>(`/user/customers/${encodeURIComponent(phone)}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
    },

    broadcast: {
      segments: () => apiFetch<BroadcastSegmentCount[]>("/user/broadcast/segments"),
      campaigns: () => apiFetch<BroadcastCampaign[]>("/user/broadcast/campaigns"),
      products: () => apiFetch<BroadcastProductItem[]>("/user/broadcast/products"),
      send: (data: BroadcastSendPayload) =>
        apiFetch<{ ok: boolean; campaignId: number; recipientCount: number }>("/user/broadcast/send", {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },

    reports: {
      sendNow: (period: "daily" | "weekly" | "monthly") =>
        apiFetch<{ ok: boolean; message: string }>("/user/reports/send-now", {
          method: "POST",
          body: JSON.stringify({ period }),
        }),
    },

    analytics: (period: string) =>
      apiFetch<AnalyticsData>(`/user/analytics?period=${period}`),

    notifications: {
      list: () => apiFetch<AppNotification[]>("/user/notifications"),
      removeAll: () => apiFetch<{ ok: boolean }>("/user/notifications", { method: "DELETE" }),
      markRead: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/notifications/${id}/read`, { method: "PATCH" }),
      markAllRead: () =>
        apiFetch<{ ok: boolean }>("/user/notifications/read-all", { method: "PATCH" }),
      remove: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/notifications/${id}`, { method: "DELETE" }),
    },

    delivery: {
      get: () => apiFetch<DeliveryData>("/user/delivery"),
      updateSettings: (data: { freeDeliveryAll?: boolean; unknownLocationPolicy?: string }) =>
        apiFetch<{ ok: boolean }>("/user/delivery/settings", {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      createZone: (data: DeliveryZonePayload) =>
        apiFetch<DeliveryZone>("/user/delivery/zones", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      updateZone: (id: number, data: DeliveryZonePayload) =>
        apiFetch<DeliveryZone>(`/user/delivery/zones/${id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      removeZone: (id: number) =>
        apiFetch<{ ok: boolean }>(`/user/delivery/zones/${id}`, { method: "DELETE" }),
    },
  },
};

export interface ApiKey {
  id: number;
  name: string;
  type: "chat" | "embedding";
  provider: string;
  model: string;
  status: "active" | "disabled";
  tokensUsed: number;
  requestsCount: number;
  avgLatencyMs: number;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreateKeyPayload {
  name: string;
  type: "chat" | "embedding";
  provider: string;
  model: string;
  apiKey: string;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  chatKeyId?: number;
  embeddingKeyId?: number;
  chatKeyName?: string;
  embeddingKeyName?: string;
  waProvider?: string;
  waStatus?: string;
  waBaseUrl?: string;
  waInstanceName?: string;
  waConfig?: Record<string, string>;
  agentEnabled?: boolean;
  conversations?: number;
  createdAt: string;
  lastLoginAt?: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  chatKeyId?: number;
  embeddingKeyId?: number;
  waProvider?: string;
  waConfig?: Record<string, string>;
}

export interface WAConfig {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  instanceName?: string;
  config?: Record<string, string>;
}

export interface DashboardStats {
  conversations: number;
  activeToday: number;
  messagesToday: number;
  waStatus: string;
  agentEnabled: boolean;
  convActive: number;
  convPending: number;
  convClosed: number;
  ordersDraft: number;
  ordersPendingReview: number;
  ordersApproved: number;
  ordersDelivered: number;
  productsActive: number;
}

export interface Conversation {
  id: number;
  customerPhone: string;
  customerName?: string;
  status: string;
  lastMessage?: string;
  agentPaused: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  conversationId: number;
  from: "customer" | "agent";
  text: string;
  createdAt: string;
}

export interface UserSettings {
  chatKeyId?: number | null;
  embeddingKeyId?: number | null;
  agentEnabled: boolean;
  systemPrompt?: string | null;
  currency: string;
  dialect: string;
  dialectStrength: number;
  style: string;
  tone: string;
  persuasion: number;
  formality: number;
  responseDelay: number;
  emojiLevel: string;
  replyLength: string;
  openingMessage?: string | null;
  closingMessage?: string | null;
  stratFollowup: boolean;
  stratCart: boolean;
  stratUpsell: boolean;
  stratPromo: boolean;
  stratReview: boolean;
  sendProductImages: boolean;
  orderSystemEnabled: boolean;
  reviewWhatsappNumber?: string | null;
  approvedOrderMessage?: string | null;
  deliveredOrderMessage?: string | null;
  lowStockThreshold: number;
  messageAggregationDelay: number;
  reportEnabled: boolean;
  reportFrequency: string;
  reportTime: string;
  reportManagerPhone?: string | null;
  groupReplyMode: string;
  allowedGroupIds: string;
  returnSystemEnabled: boolean;
  maxTokens: number;
  depositTolerance: number;
  invoiceColor: string;
  invoiceEnabled: boolean;
  omqiVerificationEnabled: boolean;
}

export interface GroupConversation {
  customerPhone: string;
  customerName: string | null;
}

export interface Product {
  id: number;
  userId: number;
  name: string;
  description: string;
  qty: number;
  unit: string;
  price: string;
  negotiationPrice: string | null;
  currency: string;
  imageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductPayload {
  name: string;
  description?: string;
  qty?: number;
  unit?: string;
  price: string;
  negotiationPrice?: string;
  currency?: string;
  status?: string;
}

export interface Coupon {
  id: number;
  userId: number;
  code: string;
  type: string;
  value: string;
  startDate: string | null;
  endDate: string | null;
  products: string;
  status: string;
  createdAt: string;
}

export interface CouponPayload {
  code: string;
  type?: string;
  value: string;
  startDate?: string;
  endDate?: string;
  products?: string;
  status?: string;
}

export interface Shift {
  open: string;
  close: string;
}

export interface WorkingHour {
  day: string;
  enabled: boolean;
  shifts: Shift[];
  open?: string;
  close?: string;
}

export interface BankAccount {
  type: "yemeni" | "international" | "omqi";
  bank?: string;
  owner: string;
  account: string;
  currency?: string;
  iban?: string;
  swift?: string;
  country?: string;
}

export interface Business {
  name: string;
  description: string;
  storeUrl: string;
  phones: Array<{ label: string; value: string }>;
  branches: Array<{ label: string; value: string }>;
  socialLinks: Record<string, string>;
  bankAccounts: BankAccount[];
  workingHours: WorkingHour[];
  returnPolicy: string;
  logoUrl: string;
}

export interface DeliveryZoneRate {
  id: number;
  zoneId: number;
  unit: string;
  cost: string;
}

export interface DeliveryZone {
  id: number;
  userId: number;
  name: string;
  minOrder: string;
  createdAt: string;
  updatedAt: string;
  rates: DeliveryZoneRate[];
}

export interface DeliveryZonePayload {
  name: string;
  minOrder?: string;
  rates?: Array<{ unit: string; cost: string }>;
}

export interface DeliveryData {
  freeDeliveryAll: boolean;
  unknownLocationPolicy: string;
  zones: DeliveryZone[];
}

export interface KnowledgeEntry {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryPayload {
  title: string;
  content: string;
  type?: string;
}

export interface CustomerProfile {
  id: number;
  userId: number;
  customerPhone: string;
  detectedName: string | null;
  city: string | null;
  isBuyer: boolean;
  inquiredProducts: string[];
  totalOrders: number;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfilePayload {
  detectedName?: string;
  city?: string;
}

export interface BroadcastSegmentCount {
  id: string;
  count: number;
}

export interface BroadcastCampaign {
  id: number;
  userId: number;
  message: string;
  segments: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BroadcastProductItem {
  id: number;
  name: string;
  interestedCount: number;
}

export interface BroadcastSendPayload {
  message: string;
  segments: string[];
  scheduleMode: "now" | "later";
  scheduledAt?: string;
  countryCodes?: string[];
  productInterests?: string[];
}

export type ReturnStatus = "pending_review" | "approved" | "rejected" | "completed";

export interface Return {
  id: number;
  userId: number;
  conversationId: number | null;
  orderId: string | null;
  customerName: string;
  customerPhone: string;
  reason: string;
  items: string;
  status: ReturnStatus;
  adminNotes: string | null;
  reviewSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  linkedOrder: {
    id: number;
    customerName: string;
    customerPhone: string;
    items: string;
    total: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface AnalyticsDailyPoint {
  date: string;
  orders: number;
  revenue: number;
  conversations: number;
}

export interface AnalyticsFunnel {
  totalConversations: number;
  conversationsWithOrders: number;
  ordersApproved: number;
  ordersDelivered: number;
}

export interface AnalyticsTopProduct {
  name: string;
  count: number;
  revenue: string;
}

export interface AnalyticsSummary {
  totalRevenue: string;
  totalOrders: number;
  avgOrderValue: string;
  conversionRate: number;
  revenueGrowth: number;
  ordersGrowth: number;
}

export interface AnalyticsData {
  dailyData: AnalyticsDailyPoint[];
  funnel: AnalyticsFunnel;
  topProducts: AnalyticsTopProduct[];
  topRequestedProducts: AnalyticsTopProduct[];
  summary: AnalyticsSummary;
  orderStatusBreakdown: Record<string, number>;
}

export interface AppNotification {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
