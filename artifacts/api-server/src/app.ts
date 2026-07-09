// @ts-nocheck
import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
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
      // Allow requests with no origin (like Render health checks) or from allowed origins
      const allowed = [
        /\.vercel\.app$/,
        /\.onrender\.com$/,
        /^http:\/\/localhost/,
      ];
      if (!origin || allowed.some(r => r.test(origin))) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for now, restrict later if needed
      }
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const sessionSecret = process.env["SESSION_SECRET"] ?? "dev-secret-change-in-prod";

const PgSession = connectPgSimple(session);

const pgPool = new pg.Pool({
  connectionString: process.env["DATABASE_URL"],
});

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: "user_sessions",
      createTableIfMissing: false,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: true, // Required for SameSite: none (cross-domain cookies)
      sameSite: "none",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

export default app;
