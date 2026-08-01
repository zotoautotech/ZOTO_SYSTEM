import { Readable } from "node:stream";
import type { drive_v3 } from "googleapis";
import { env } from "../config/env.js";

/**
 * Uploads a buffer as a new, fully private Drive file (no "anyone" link at all — every
 * view/download goes through our own /uploads/:fileId/stream, gated by our own login, never
 * Drive's own UI). Shared by the doer-facing upload route (Backend/src/routes/uploads.ts)
 * and the generated Dispatch Gate Pass PDF (Backend/src/services/gatePass.ts) — both need
 * the exact same create-then-strip-inherited-permission pattern.
 */
export async function uploadBufferToDrive(drive: drive_v3.Drive, buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [env.driveFolderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const fileId = response.data.id!;

  // Explicitly strip any "anyone" access this file might inherit from the folder (the
  // folder has at times been set to "Anyone with the link: Editor" — .delete() is what
  // actually overrides an inherited grant; plain .create() is a silent no-op against it).
  try {
    await drive.permissions.delete({
      fileId,
      permissionId: "anyoneWithLink",
      supportsAllDrives: true,
    });
  } catch {
    // No inherited "anyone" permission to remove — already private, nothing to do.
  }

  return fileId;
}
