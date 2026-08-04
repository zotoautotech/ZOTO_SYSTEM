import rateLimit from "express-rate-limit";

/** Passwords in USERS are plain text (see auth.ts) with no lockout of their own, so the
 * login endpoint is the one place that actually needs brute-force protection at the HTTP
 * layer. Best-effort on Vercel: each serverless instance keeps its own in-memory counter
 * (no shared store), so this doesn't rate-limit perfectly across a fleet of cold starts —
 * but it still meaningfully slows down a single attacker hammering one warm instance, which
 * is the realistic threat model for an internal app like this one. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many login attempts — try again in a few minutes." } },
});

/** Looser limit for the self-service password-change route — already behind requireAuth,
 * but still worth capping so a stolen/leaked token can't be used to hammer the current-
 * password check. */
export const changePasswordRateLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "TOO_MANY_REQUESTS", message: "Too many attempts — try again in a few minutes." } },
});
