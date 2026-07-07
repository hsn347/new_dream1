---
name: Agent context architecture
description: What goes in buildAgentContext vs vector search vs on-demand queries
---

## Rule
`buildAgentContext(userId)` is intentionally minimal — only injects:
- Business name + description
- Return/exchange policy
- Delivery costs (zones + rates)

**Why:** Injecting everything (products, branches, hours, bank accounts) bloats every LLM call with irrelevant tokens. Products are retrieved via vector search (RAG) per-message; coupons are queried on-demand via `buildCouponContext` when coupon intent is detected.

**What NOT to include in base context:**
- Products (→ `knowledge_chunks` vector search)
- Coupons (→ `buildCouponContext`, intent-gated)
- Business phones, branches, social links, bank accounts, working hours (→ not needed per-message)
- Store URL (→ not needed per-message)

**Knowledge base:** All knowledge entries go through vector search (`searchChunks` via Cohere embeddings).

**How to apply:** When adding new data sources, default to NOT including them in `buildAgentContext`. Only add if they are needed in every single message regardless of topic.
