---
name: Multi-provider WhatsApp
description: Architecture decisions for supporting multiple WhatsApp providers (Evolution, Twilio, 360dialog, Meta, Gupshup) in the admin UI
---

## Provider list
5 providers: Evolution, Twilio, 360dialog, Meta Business, Gupshup.

## Data model
- `whatsappConnectionsTable` has a `config text` column (JSON) for non-Evolution provider credentials
- Evolution: uses existing `baseUrl`, `apiKey`, `instanceName` columns
- Others: all credentials stored in `config` as JSON (accountSid/authToken/fromNumber for Twilio, apiKey/phoneNumber for 360dialog, etc.)

## Key files
- `artifacts/whatsapp-ai-saas/src/lib/waProviders.ts` — provider metadata, field definitions, webhook URL helper (pure data, no React)
- `artifacts/whatsapp-ai-saas/src/components/WhatsAppProviderConfig.tsx` — ProviderSelector + ProviderFields + WebhookUrlBox + full WhatsAppProviderConfig component
- `artifacts/api-server/src/lib/providers/twilio.ts` — testTwilioConnection + sendTwilioMessage
- `artifacts/api-server/src/lib/providers/dialog360.ts` — testDialog360Connection + sendDialog360Message

## HMR rule
**Why:** Vite Fast Refresh requires all named exports from a file to be React components. Mixing non-component exports (constants, types) with components causes HMR invalidation.
**How to apply:** Provider metadata (WA_PROVIDERS, PROVIDER_FIELDS, etc.) lives in `waProviders.ts` (not in the component file). Pages import WA_PROVIDERS from `@/lib/waProviders`, not from the component.

## UserDetailPage WhatsApp tab layout
1. Status header (always)
2. `WhatsAppProviderConfig` — handles config display + provider switching (always)
3. `WhatsAppConnectionWizard` — only when provider === "evolution"

## Admin routes
- `GET /api/admin/users/:id` — returns `waProvider`, `waConfig` (parsed JSON), `waBaseUrl`, `waInstanceName`
- `PUT /api/admin/users/:id/whatsapp` — accepts `{ provider, config, baseUrl, apiKey, instanceName }`
- `POST /api/admin/users/:id/whatsapp/test` — routes to provider-specific test function
