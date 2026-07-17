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

uploadsRouter.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "No file uploaded (or unsupported type — PDF/PNG/JPG only)" } });
    }

    const drive = await getDriveClient();
    const response = await drive.files.create({
      requestBody: {
        name: `${Date.now()}-${req.file.originalname}`,
        parents: env.driveFolderId ? [env.driveFolderId] : undefined,
      },
      media: {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      },
      fields: "id, webViewLink",
    });

    await drive.permissions.create({
      fileId: response.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });

    res.status(201).json({ fileId: response.data.id, url: response.data.webViewLink });
  } catch (err) {
    next(err);
  }
});
