import express from "express";
import cors from "cors";
import compression from "compression";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { mastersRouter } from "./routes/masters.js";
import { homeRouter } from "./routes/home.js";
import { ordersRouter } from "./routes/orders.js";
import { tripsRouter } from "./routes/tripRoutes.js";
import { uploadsRouter } from "./routes/uploads.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

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

app.use(cors({ origin: env.allowedOrigin }));
app.use(compression());
app.use(express.json({ limit: "5mb" }));

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/masters", mastersRouter);
app.use("/api/v1/home", homeRouter);
app.use("/api/v1/orders", ordersRouter);
app.use("/api/v1/transport-trips", tripsRouter);
app.use("/api/v1/uploads", uploadsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
