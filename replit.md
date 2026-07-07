# وكيل المبيعات — WhatsApp AI SaaS

منصة SaaS متعددة المستأجرين باللغة العربية لأتمتة مبيعات واتساب بالذكاء الاصطناعي.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/whatsapp-ai-saas run dev` — run the frontend (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Demo users: `admin@demo.com / admin123`, `user@demo.com / user123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080)
- Frontend: React 19 + Vite 7 + Tailwind CSS 4 + Radix UI + Wouter (port 5000)
- DB: PostgreSQL + Drizzle ORM
- Auth: custom bcrypt + express-session
- State: TanStack Query + local useState
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/index.ts` — single source of truth for DB schema
- `artifacts/api-server/src/routes/` — Express routes (admin/, user/, webhooks/)
- `artifacts/api-server/src/lib/agentContext.ts` — builds AI agent context from user data
- `artifacts/whatsapp-ai-saas/src/lib/api.ts` — typed frontend API client
- `artifacts/whatsapp-ai-saas/src/pages/` — all UI pages
- Vite proxy: `/api` → `http://localhost:8080` (configured in `vite.config.ts`)

## Database Tables

- `users` — multi-tenant user accounts (admin/user roles)
- `api_keys` — shared AI API keys (Groq, Cohere) managed by admin
- `whatsapp_connections` — per-user WhatsApp/Evolution API config
- `user_settings` — per-user settings (agentEnabled, systemPrompt, keyId references)
- `conversations` — incoming WhatsApp conversations per user
- `messages` — individual messages within conversations
- `products` — per-user product catalog (name, price, qty, unit, status)
- `coupons` — per-user discount coupons (code, type, value, dates)
- `businesses` — per-user business info (name, hours, branches, social links, bank accounts)

## Architecture decisions

- Multi-tenant isolation: all user data queries filter by `userId` from session
- Agent context: `buildAgentContext(userId)` assembles products + coupons + business info into a text block injected into the AI system prompt on every incoming WhatsApp message
- Business data stored as JSON text columns (workingHours, socialLinks, bankAccounts) for flexibility
- Products & coupons use `text` for price/value to avoid floating point precision issues
- Frontend uses relative `/api` URLs proxied by Vite to avoid CORS issues in dev

## Changelog (recent sessions)

### Session — May 2026 (PDF Invoice System)
- **PDF Invoice Generation** (`artifacts/api-server/src/lib/invoice.ts`): Full Arabic RTL invoice generator using `pdfkit` + Cairo font. 3 templates: classic/modern/minimal. Per-user primary color customization. Business logo from `business.logoUrl`. Sent as WhatsApp document via Evolution API.
- **Schema changes**: `logoUrl text` added to `businessesTable`; `invoiceColor text default('#16a34a')` and `invoiceEnabled boolean default(true)` added to `userSettingsTable`. DB pushed.
- **Cairo Arabic font** at `artifacts/api-server/src/assets/Cairo.ttf` — build.mjs copies `src/assets/ → dist/assets/` after esbuild.
- **`pdfkit` externalized** in `build.mjs` (along with `fontkit`) to avoid `@swc/helpers` bundling issue at runtime.
- **Evolution API**: `sendEvolutionDocument(url, phone, base64, filename, caption)` added to `evolution.ts`.
- **Invoice triggers**: (1) `routes/user/orders.ts` PATCH `/:id/status` when status→"approved"; (2) `lib/orderActions.ts` `handleOmqiVerifiedDeposit` on auto-approval. Both check `invoiceEnabled` flag before sending.
- **Admin invoice settings** (`AdminAgentSettingsPage.tsx` InvoiceSection): template selector (classic/modern/minimal), toggles for notes/delivery/deposit/watermark, footer text. Stored in `system_settings` with prefix `invoice_`.
- **User invoice settings** (`SettingsPage.tsx`): color picker (hex) + enabled toggle. GET/PUT via `/api/user/settings`.
- **Business page** (`BusinessPage.tsx` + `Business` interface in `api.ts`): `logoUrl` field added — text input with live image preview, labeled "شعار المتجر" with subtitle explaining it's used in invoices.



### Session — May 2026 (Admin Agent Control + Workflow Cleanup)
- **WorkflowPage removed from user section**: Removed `/workflow` link from user sidebar and route from App.tsx. Workflow page remains accessible to admins only at `/admin/workflow`.
- **New Admin Agent Settings Page** (`/admin/agent-settings`): Comprehensive 6-section accordion page for controlling all agent behavior globally across all tenants. File: `artifacts/whatsapp-ai-saas/src/pages/admin/AdminAgentSettingsPage.tsx`. Added to admin sidebar as "إعدادات الوكيل" (Bot icon).
  - **شخصية الوكيل**: dialect, dialectStrength (1-10), style, tone, emoji level, reply length, persuasion (1-10), formality (1-10)
  - **استراتيجيات البيع**: 5 toggles (followup, cart, upsell, promo, review) + coupon timing select
  - **أدوات الوكيل**: order system, return system, send product images, group reply mode
  - **الأداء والذاكرة**: maxTokens (200-4000), responseDelay (0-30s), conversationWindow (2-40 msgs), sessionGapHours (1-72h), lowStockThreshold
  - **الرسائل الخاصة**: openingMessage, closingMessage (textarea)
  - **إعدادات متقدمة**: profileExtraction toggle, negotiationEnabled toggle
- **Webhook global agent settings** (`webhook.ts`): Added `getGlobalAgentSettings()` function with 30s cache reading `system_settings` keys prefixed `agent_default_*`. Global admin settings override per-user settings for all behavior fields. Per-user settings (API keys, systemPrompt, WA connection) are unaffected. All configurable fields now include: convWindow (was hardcoded to 6), sessionGapHours (was hardcoded to 6h), maxTokens, responseDelay, sendProductImages, orderSystem, returnSystem.
- **Stored in**: `system_settings` table with keys like `agent_default_dialect`, `agent_default_max_tokens`, etc. No schema changes needed.



### Session — May 2026 (Workflow Page + Context Architecture Fix)
- **User Workflow Page** (`/workflow`): n8n-like visual canvas showing the 7-stage agent pipeline (WhatsApp → Buffer → Context → RAG → AI → Tools → Response) as connected SVG nodes. Each node is clickable and shows an editable settings panel. Saves via `PUT /api/user/settings`. File: `artifacts/whatsapp-ai-saas/src/pages/user/WorkflowPage.tsx`. Added to user sidebar + App.tsx routing.
- **Agent context architecture fix** (`agentContext.ts`): Removed products (now via vector only), phones, branches, social links, bank accounts, working hours, and store URL from `buildAgentContext`. Only keeps: business name, description, return/exchange policy, delivery costs.
- **New schema fields** (`userSettingsTable`): `maxTokens integer default(1500)` — controls max tokens per AI reply; `returnSystemEnabled boolean default(true)` — toggles the `request_return` tool on/off. DB pushed.
- **maxTokens in webhook**: `settings.maxTokens ?? 1500` passed to `generateGroqReply` / `generateGeminiReply` on every call.
- **returnSystemEnabled in webhook**: `AGENT_TOOLS` filtered per-request based on `settings.returnSystemEnabled`; `orderSystemEnabled` still controls the whole order system.
- **Settings API** (`routes/user/index.ts`): GET and PUT endpoints updated to expose `maxTokens` and `returnSystemEnabled`. `UserSettings` interface in `api.ts` updated with both fields.
- **Pre-existing bug fixed** (`webhook.ts` line 983): `incomingText` used before declaration in group-conv insert — replaced with inline extraction from `data["message"]`.

### Session — May 2026
- **Report frequency multi-select**: checkboxes for daily/weekly/monthly (comma-separated in `reportFrequency` text column; legacy "all" still supported as fallback).
- **Notification auto-clear**: closing the notification bell panel deletes all notifications from the DB via `DELETE /api/user/notifications` endpoint. `removeAll()` added to `api.ts`.
- **Settings smart search**: full-text Arabic keyword search bar (100+ keyword index) for the settings page; Ctrl+K shortcut; hides non-matching sections; auto-opens matches; "no results" empty state.
- **Orders archive view**: active orders (`draft`, `pending_payment`, `pending_review`, `approved`) vs archived orders (`delivered`, `rejected`, `cancelled`, `returned`) split with a frontend-only toggle. Stats card "في الأرشيف (X)" is clickable. No backend/schema changes.
- **Bulk archive actions**: "تصدير Excel" exports styled `.xlsx` with bold green headers, alternate row shading, column widths, RTL layout, auto-filter — using `exceljs`. "حذف الكل من الأرشيف" button with inline confirmation permanently deletes all archived orders via `DELETE /api/user/orders/archive`.

## Product

- **Dashboard**: real-time stats (conversations, messages today, WA status, agent toggle)
- **Products**: full CRUD — add/edit/delete product catalog with pricing and availability
- **Coupons**: full CRUD — create/delete discount coupons with auto-expiry detection
- **Business**: single-page multi-tab form — store info, working hours, phone numbers, branches, social links, bank accounts
- **Conversations**: real-time WhatsApp conversation viewer with message history
- **Settings**: AI key selection, system prompt, WhatsApp connection config
- **Webhook**: Evolution API webhook processes incoming messages and auto-replies using Groq with full business context injected into the system prompt
- **Multi-key failover**: per-user primary + ordered fallback chat keys; if primary fails the next is tried automatically; admin notified via WhatsApp on key failure
- **Admin Settings** (`/admin/settings`): Yemen smart phone number field (+967) for admin WhatsApp notifications, with test-send button
- **Scheduled Reports**: per-user WhatsApp reports to manager — daily/weekly/monthly/all; configurable send time (HH:MM); includes revenue, orders, growth %, top products, customer activity, pending orders, low stock, smart AI recommendations; "send now" test button; scheduler checks every 60s via `startReportScheduler()` in `index.ts`; report builder in `lib/reports.ts`

## User preferences

- Arabic-first UI (RTL)
- Keep visual design consistent with existing shadcn/Radix components
- Use `useToast` from `@/hooks/use-toast` for user notifications

## Gotchas

- Always run `pnpm --filter @workspace/db run push` after schema changes
- The Vite proxy only works in dev — in production the API and frontend must be on the same domain or use proper CORS
- `requireAuth` middleware is applied at router level in `routes/user/index.ts` (sub-routers inherit it)
- `buildAgentContext` is called on every webhook — if performance is critical, consider caching per user

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
