---
name: UserSettings new fields and type cast gotchas
description: maxTokens and returnSystemEnabled — why they exist and how AGENT_TOOLS filtering works
---

## Fields added to userSettingsTable
- `maxTokens integer default(1500)` — per-user max tokens cap passed to every LLM call
- `returnSystemEnabled boolean default(true)` — toggles whether `request_return` tool is included

## AGENT_TOOLS filter type issue
When filtering `AGENT_TOOLS` (a readonly tuple) to exclude disabled tools, `.filter()` returns a plain array whose type doesn't overlap with the tuple type. TypeScript refuses a direct cast. Must use double assertion:

```typescript
(tools as unknown as typeof AGENT_TOOLS)
```

**Why:** `AGENT_TOOLS` is typed as `readonly [T1, T2]` (2-element tuple). After `.filter()` the result is `Array<T1 | T2>` which TypeScript considers incompatible even with `as`.

## API surface
- GET/PUT `/api/user/settings` — both updated to include these fields
- `UserSettings` interface in `api.ts` — must include both fields
- `DEFAULT` object in `SettingsPage.tsx` — must include both fields to satisfy TypeScript

## Webhook usage
```typescript
const maxTokens = settings.maxTokens ?? 1500;
// passed as 7th arg to generateGroqReply / generateGeminiReply
```
