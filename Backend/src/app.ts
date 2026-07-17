import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { mastersRouter } from "./routes/masters.js";
import { ordersRouter } from "./routes/orders.js";
import { uploadsRouter } from "./routes/uploads.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(cors({ origin: env.allowedOrigin }));
app.use(express.json({ limit: "5mb" }));

app.use("/api/v1/health", healthRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/masters", mastersRouter);
app.use("/api/v1/orders", ordersRouter);
app.use("/api/v1/uploads", uploadsRouter);

app.use(notFoundHandler);
app.use(errorHandler);
