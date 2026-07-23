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

function verifyViewToken(fileId: string, token: string): boolean {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { fileId: string; purpose: string };
    return payload.purpose === "view-attachment" && payload.fileId === fileId;
  } catch {
    return false;
  }
}

/** Streams the file's raw bytes. Used by the /viewer page below (as the <img>/<embed> src)
 * and for the Download button (`?download=1` switches to a Content-Disposition that forces
 * a save-as instead of inline display). Auth is the short-lived token from /view-url, not
 * the usual bearer header, since this is a plain resource load, not an API call. */
uploadsRouter.get("/:fileId/stream", async (req, res, next) => {
  try {
    if (!verifyViewToken(req.params.fileId, String(req.query.token ?? ""))) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired view link" } });
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

    const filename = (meta.data.name || "attachment").replace(/"/g, "");
    const disposition = req.query.download ? "attachment" : "inline";
    res.setHeader("Content-Type", meta.data.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    stream.data.pipe(res);
  } catch (err) {
    next(err);
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** A small self-contained viewer page — never Drive's own UI (Share dialog, edit access,
 * the whole file-manager chrome), just the content plus one clearly visible Download
 * button. This is what "View attachment" actually opens; /stream above is just the raw
 * bytes it (and the Download button) point at. */
uploadsRouter.get("/:fileId/viewer", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? "");
    if (!verifyViewToken(req.params.fileId, token)) {
      return res.status(401).send("Invalid or expired view link.");
    }

    const drive = await getDriveClient();
    const meta = await drive.files.get({
      fileId: req.params.fileId,
      fields: "name,mimeType",
      supportsAllDrives: true,
    });
    const name = escapeHtml(meta.data.name || "Attachment");
    const isImage = (meta.data.mimeType || "").startsWith("image/");
    const streamUrl = `./stream?token=${encodeURIComponent(token)}`;
    const downloadUrl = `./stream?token=${encodeURIComponent(token)}&download=1`;

    const content = isImage
      ? `<img id="attachment-image" src="${streamUrl}" alt="${name}" />`
      : `<embed src="${streamUrl}" type="application/pdf" />`;
    const controls = isImage
      ? `<div class="zoom-controls" aria-label="Image zoom controls">
          <button type="button" id="zoom-out" aria-label="Zoom out">−</button>
          <button type="button" id="zoom-reset" aria-label="Reset zoom">Fit</button>
          <button type="button" id="zoom-in" aria-label="Zoom in">+</button>
        </div>`
      : "";

    res.setHeader("Content-Type", "text/html");
    res.send(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${name}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #202124; font-family: -apple-system, Segoe UI, Roboto, sans-serif; height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #2d2e30; color: #e8eaed; flex-shrink: 0; }
  header .name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .download-btn { display: flex; align-items: center; gap: 6px; background: #8ab4f8; color: #202124; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; flex-shrink: 0; }
  /* Google Drive-style contained preview by default. Zoomed images can still scroll in
     either direction inside this pane. */
  main { flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center; padding: 24px; }
  main::-webkit-scrollbar { width: 14px; height: 14px; }
  main::-webkit-scrollbar-track { background: #202124; }
  main::-webkit-scrollbar-thumb { background: #777; border: 3px solid #202124; border-radius: 999px; }
  main::-webkit-scrollbar-thumb:hover { background: #999; }
  img { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; box-shadow: 0 4px 14px rgba(0, 0, 0, .35); }
  embed { width: 100%; height: 100%; border: none; }
  .zoom-controls { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; overflow: hidden; border: 1px solid #5f6368; border-radius: 8px; background: #303134; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
  .zoom-controls button { min-width: 42px; height: 34px; border: 0; border-right: 1px solid #5f6368; background: transparent; color: #e8eaed; font-size: 18px; cursor: pointer; }
  .zoom-controls button#zoom-reset { min-width: 52px; font-size: 13px; }
  .zoom-controls button:last-child { border-right: 0; }
  .zoom-controls button:hover { background: #3c4043; }
</style>
</head>
<body>
  <header>
    <span class="name">${name}</span>
    <a class="download-btn" href="${downloadUrl}" download>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></svg>
      Download
    </a>
  </header>
  <main id="viewer-content">${content}</main>
  ${controls}
  ${isImage ? `<script>
    const image = document.getElementById("attachment-image");
    const content = document.getElementById("viewer-content");
    let zoom = 1;
    function applyZoom() {
      if (zoom === 1) {
        image.style.maxWidth = "100%";
        image.style.maxHeight = "100%";
        image.style.width = "auto";
        image.style.height = "auto";
      } else {
        image.style.maxWidth = "none";
        image.style.maxHeight = "none";
        image.style.width = Math.round(image.naturalWidth * zoom) + "px";
        image.style.height = "auto";
      }
    }
    document.getElementById("zoom-in").onclick = () => { zoom = Math.min(3, zoom + 0.25); applyZoom(); };
    document.getElementById("zoom-out").onclick = () => { zoom = Math.max(0.5, zoom - 0.25); applyZoom(); };
    document.getElementById("zoom-reset").onclick = () => { zoom = 1; applyZoom(); content.scrollTo({ top: 0, left: 0 }); };
  </script>` : ""}
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});
