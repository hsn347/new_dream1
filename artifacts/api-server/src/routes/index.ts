import { Router, type IRouter } from "express";
import express from "express";
import path from "path";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import adminKeysRouter from "./admin/keys.js";
import adminUsersRouter from "./admin/users.js";
import adminSettingsRouter from "./admin/settings.js";
import adminAdminsRouter from "./admin/admins.js";
import adminConversationsRouter from "./admin/conversations.js";
import userRouter from "./user/index.js";
import webhookRouter from "./webhook.js";

const router: IRouter = Router();

const uploadsDir = path.join(process.cwd(), "public/uploads");
router.use("/uploads", express.static(uploadsDir));

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/admin/keys", adminKeysRouter);
router.use("/admin/users", adminUsersRouter);
router.use("/admin/settings", adminSettingsRouter);
router.use("/admin/admins", adminAdminsRouter);
router.use("/admin/conversations", adminConversationsRouter);
router.use("/user", userRouter);
router.use("/webhooks", webhookRouter);

export default router;
