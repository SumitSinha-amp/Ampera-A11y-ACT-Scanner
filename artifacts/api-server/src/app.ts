import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Trust reverse-proxy headers (Replit, Azure App Service, etc.)
// Required for secure cookies and correct IP detection behind a TLS-terminating proxy.
app.set("trust proxy", 1);

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
const SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days in seconds (for PgStore)

app.use(
  session({
    store: new PgStore({
      pool,
      // Explicitly match cookie maxAge so DB sessions never expire before the cookie.
      // Without this, connect-pg-simple may fall back to its 1-day default.
      ttl: SESSION_TTL_SEC,
    }),
    secret: process.env.SESSION_SECRET || "a11y-act-tool-secret-change-in-prod",
    resave: false,
    // rolling: true resets the cookie expiry on every response.
    // Without this the 7-day countdown starts at login and never resets,
    // so active users get logged out exactly 7 days after they first signed in.
    rolling: true,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Auto-enable secure flag when running behind HTTPS proxy (production / Azure / Replit)
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_MS,
      sameSite: "lax",
    },
  })
);

app.use("/api", router);

export default app;
