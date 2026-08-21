import express from "express";
import cors from "cors";
import compression from "compression";
import helmetImport from "helmet";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { mastersRouter } from "./routes/masters.js";
import { homeRouter } from "./routes/home.js";
import { ordersRouter } from "./routes/orders.js";
import { tripsRouter } from "./routes/tripRoutes.js";
import { uploadsRouter } from "./routes/uploads.js";
import { checklistRouter } from "./routes/checklist.js";
import { permissionAuditRouter } from "./routes/permissionAudit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// helmet's own type declarations sometimes resolve as a non-callable namespace on Vercel's
// build (its dual ESM/CJS "exports" map has been flaky under some npm-install/build-cache
// states there even though this same import type-checks and works fine locally) — cast
// around the type-only mismatch rather than chase Vercel's build cache; the runtime import
// itself is unaffected.
const helmet = helmetImport as unknown as (options?: Record<string, unknown>) => express.RequestHandler;

export const app = express();

// Vercel puts every request behind a proxy — without this, req.ip (and therefore
// express-rate-limit's per-client bucketing) sees the proxy's own address for every
// request instead of the real client IP, making the login rate limit useless (everyone
// would share one bucket).
app.set("trust proxy", 1);

// Sets the usual defensive headers (X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security, Referrer-Policy, etc.) — CSP is left off since this is
// primarily a JSON API and the one HTML page it does serve (uploads.ts's attachment
// /viewer, for the image zoom controls) relies on an inline <script>; tuning a CSP around
// that one page isn't worth it for an internal, login-gated app.
app.use(helmet({ contentSecurityPolicy: false }));

// Express auto-generates an ETag for every JSON response by default, so a browser doing a
// conditional GET on an unchanged-looking body gets back a bare 304 and reuses whatever it
// cached last — including a genuinely stale/empty response from before data existed. Given
// this app's whole design is "read live from Sheets, don't trust a stale cache", API
// responses must never be served from the browser's HTTP cache either.
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (curl, server-to-server, same-origin) — allow through.
      if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
app.use(compression());
app.use(express.json({ limit: "5mb" }));

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/masters", mastersRouter);
app.use("/api/v1/home", homeRouter);
app.use("/api/v1/orders", ordersRouter);
app.use("/api/v1/transport-trips", tripsRouter);
app.use("/api/v1/uploads", uploadsRouter);
app.use("/api/v1/checklist", checklistRouter);
app.use("/api/v1/admin", permissionAuditRouter);

app.use(notFoundHandler);
app.use(errorHandler);
