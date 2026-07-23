import { Router } from "express";
import multer from "multer";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { getDriveClient } from "../services/googleAuth.js";
import { requireAuth } from "../middleware/auth.js";

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg"];
    cb(null, allowed.includes(file.mimetype));
  },
});

/** Builds an AppSheet-style filename: `<context>_<timestamp><ext>` when a context (e.g.
 * an order ID) is given, else `<timestamp>-<original name>`. Keeps the real extension so
 * the file still opens correctly regardless of naming. */
function buildFilename(originalName: string, context?: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot >= 0 ? originalName.slice(dot) : "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (context) {
    const safeContext = context.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${safeContext}_${stamp}${ext}`;
  }
  return `${Date.now()}-${originalName}`;
}

uploadsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "No file uploaded (or unsupported type — PDF/PNG/JPG only)" } });
    }
    if (!env.driveFolderId) {
      return res.status(500).json({
        error: { code: "MISCONFIGURED", message: "Upload folder not configured (DRIVE_FOLDER_ID) — contact an admin" },
      });
    }

    const context = typeof req.body?.context === "string" ? req.body.context : undefined;
    const drive = await getDriveClient();
    const response = await drive.files.create({
      requestBody: {
        name: buildFilename(req.file.originalname, context),
        parents: [env.driveFolderId],
      },
      media: {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      },
      fields: "id, webViewLink",
      supportsAllDrives: true,
    });

    await drive.permissions.create({
      fileId: response.data.id!,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true,
    });

    res.status(201).json({ fileId: response.data.id, url: response.data.webViewLink });
  } catch (err) {
    next(err);
  }
});
