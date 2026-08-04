import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

// Only a couple of error shapes are safe to show verbatim to a doer — everything else
// (a raw Google API error message, a driver/library exception, etc.) can incidentally
// include internal details (project IDs, quota info, stack fragments) that shouldn't reach
// the client. Zod's own message is just its field-level validation text, always safe.
function publicMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");
  }
  return "Something went wrong — please try again.";
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Full detail always goes to the server log, regardless of what the client sees.
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: publicMessage(err) } });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}
