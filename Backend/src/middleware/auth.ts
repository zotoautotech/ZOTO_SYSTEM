import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getPermissions } from "../services/permissions.js";

export interface AuthUser {
  employeeId: string;
  name: string;
  modules: string[] | "ALL";
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
  }
  try {
    const token = header.slice("Bearer ".length);
    // Pin the algorithm explicitly — without this, jsonwebtoken trusts whatever `alg` the
    // token's own header claims, which is how algorithm-confusion attacks forge a valid
    // signature (e.g. an attacker-crafted RS256 token verified as if it were HS256, or vice
    // versa) without ever knowing the real secret.
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] }) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired token" } });
  }
}

/**
 * Gates a route by USERS.Permissions_Process, AppSheet-style: permissions are read
 * LIVE from the sheet (15s cache) on every request rather than trusted from the JWT,
 * so an admin editing the Permissions_Process cell takes effect within seconds — no
 * re-login needed. A missing Employee Id row means access was revoked entirely.
 */
export function requireModule(moduleKey: string) {
  return requireAnyModule([moduleKey]);
}

/**
 * Gates a route by "has AT LEAST ONE of these modules". Most routes want the single-key
 * `requireModule`, but the order-family routes are shared across stages: a PDI-only doer
 * still has to be able to READ an order (their item detail page calls GET /orders/:id), and
 * a Stock Release doer likewise. Gating those shared reads on one specific module is exactly
 * what locked PDI-only and Stock-Release-only users out of the app entirely — the whole
 * /orders router used to sit behind requireModule("punch-order"), so anyone without Order
 * Punch got "No access to this module" when saving their own stage's form.
 */
export function requireAnyModule(moduleKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
    }
    try {
      const perms = await getPermissions(req.user.employeeId);
      if (!perms) {
        return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Account inactive or removed" } });
      }
      if (perms.modules !== "ALL" && !moduleKeys.some((k) => (perms.modules as string[]).includes(k))) {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "No access to this module" } });
      }
      // Refresh req.user with the live values so downstream handlers see current permissions.
      req.user = { ...req.user, ...perms };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Every module whose screens live under the /orders router — the set allowed to perform
 * the shared order READS (list, detail, items). Stage-specific WRITES still require their
 * own single module key. Keep in sync with Frontend/src/lib/modules.ts + tripStages.ts. */
export const ORDER_FAMILY_MODULES = [
  "punch-order",
  "sale-order",
  "so-confirmation",
  "dispatch-approval",
  "pdi",
  "transport",
  "transport-reached",
  "stock-release",
  "tax-invoice",
  "dispatch",
  "collect-lr",
  "delivery",
];

/**
 * Gates a destructive route by USERS.CAN_DELETE — also read live from the sheet.
 * Fails closed (missing row/blank cell = no delete access) since it guards an
 * irreversible action.
 */
export async function requireCanDelete(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
  }
  try {
    const perms = await getPermissions(req.user.employeeId);
    if (!perms?.canDelete) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Not permitted to delete orders" } });
    }
    next();
  } catch (err) {
    next(err);
  }
}
