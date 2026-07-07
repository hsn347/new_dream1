// ══════════════════════════════════════════════════════════════════════
// webhook.ts — HTTP routing layer only
//
// هذا الملف مسؤول فقط عن استقبال طلبات HTTP من Evolution API
// وتوجيهها لـ agent.ts الذي يحتوي على كل منطق الوكيل.
//
// لتعديل سلوك الوكيل → افتح: src/lib/agent.ts
// ══════════════════════════════════════════════════════════════════════

import { Router } from "express";
import { processEvolutionPayload, handleCustomerTyping } from "../lib/agent.js";

const router = Router();

// ── Evolution API: webhook payload ────────────────────────────────────
router.post("/evolution/:userId", async (req, res) => {
  res.json({ received: true });
  const userId = Number(req.params["userId"]);
  await processEvolutionPayload(userId, req.body as Record<string, unknown>);
});

router.post("/evolution/:userId/:event", async (req, res) => {
  res.json({ received: true });
  const userId = Number(req.params["userId"]);
  const body = req.body as Record<string, unknown>;
  if (!body["event"]) {
    body["event"] = (req.params["event"] as string).replace(/-/g, ".").replace(/_/g, ".");
  }
  await processEvolutionPayload(userId, body);
});

// ── Evolution API: webhook verification (GET challenge) ───────────────
router.get("/evolution/:userId", (req, res) => {
  const challenge = (req.query as Record<string, string>)["challenge"];
  if (challenge) { res.send(challenge); return; }
  res.json({ status: "ok", userId: req.params["userId"] });
});

router.get("/evolution/:userId/:event", (req, res) => {
  const challenge = (req.query as Record<string, string>)["challenge"];
  if (challenge) { res.send(challenge); return; }
  res.json({ status: "ok", userId: req.params["userId"], event: req.params["event"] });
});

export default router;
