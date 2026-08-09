import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import MemoryStore from "memorystore";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        /\.vercel\.app$/,
        /\.onrender\.com$/,
        /^http:\/\/localhost/,
      ];
      if (!origin || allowed.some(r => r.test(origin))) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const sessionSecret = process.env["SESSION_SECRET"] ?? "dev-secret-change-in-prod";

// In-memory session store — much faster than PostgreSQL (no DB round-trip per request)
// Auto-prunes expired sessions every hour, max 1000 concurrent sessions
const MStore = MemoryStore(session);

app.use(
  session({
    store: new MStore({
      checkPeriod: 60 * 60 * 1000,        // prune expired sessions every 1 hour
      ttl: 30 * 24 * 60 * 60 * 1000,      // 30 days max session age
      max: 1000,                           // max concurrent sessions in memory
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

export default app;

