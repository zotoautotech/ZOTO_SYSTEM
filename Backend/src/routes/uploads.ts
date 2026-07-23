import { Router } from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { getDriveClient } from "../services/googleAuth.js";
import { requireAuth } from "../middleware/auth.js";

export const uploadsRouter = Router();

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

/** Files are kept fully private on Drive (no "anyone" link at all) — every view/download
 * goes through /stream below, gated by our own login, never Drive's own UI (Share dialog,
 * edit access, etc.). */
uploadsRouter.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
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
      fields: "id",
      supportsAllDrives: true,
    });

    // Explicitly strip any "anyone" access this file might inherit from the folder (the
    // folder has at times been set to "Anyone with the link: Editor" — .update() is what
    // actually overrides an inherited grant; plain .create() is a silent no-op against it).
    try {
      await drive.permissions.delete({
        fileId: response.data.id!,
        permissionId: "anyoneWithLink",
        supportsAllDrives: true,
      });
    } catch {
      // No inherited "anyone" permission to remove — already private, nothing to do.
    }

    res.status(201).json({ fileId: response.data.id });
  } catch (err) {
    next(err);
  }
});

/** Mints a short-lived (5 min) token scoped to one file, so the browser's plain top-level
 * navigation to /stream (which can't carry an Authorization header) can still prove the
 * request came from an authenticated session moments ago. */
uploadsRouter.get("/:fileId/view-url", requireAuth, (req, res) => {
  const token = jwt.sign({ fileId: req.params.fileId, purpose: "view-attachment" }, env.jwtSecret, {
    expiresIn: "5m",
  });
  res.json({ token });
});

/** Streams the file's bytes directly — no Drive UI (Share dialog, edit permissions, etc.)
 * ever reaches the doer, just the content in the browser's own PDF/image viewer, which
 * already has its own download button. Auth is the short-lived token from /view-url above,
 * not the usual bearer header, since this is a plain link navigation, not an API call. */
uploadsRouter.get("/:fileId/stream", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? "");
    let payload: { fileId: string; purpose: string };
    try {
      payload = jwt.verify(token, env.jwtSecret) as typeof payload;
    } catch {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired view link" } });
    }
    if (payload.purpose !== "view-attachment" || payload.fileId !== req.params.fileId) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid view link" } });
    }

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: req.params.fileId,
      fields: "name,mimeType",
      supportsAllDrives: true,
    });
    const stream = await drive.files.get(
      { fileId: req.params.fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", meta.data.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${(meta.data.name || "attachment").replace(/"/g, "")}"`);
    stream.data.pipe(res);
  } catch (err) {
    next(err);
  }
});
