import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { getPermissions } from "../services/permissions.js";

export interface AuthUser {
  email: string;
  name: string;
  role: string;
  modules: string[] | "ALL";
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
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired token" } });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
    }
    if (!roles.includes(req.user.role) && req.user.role !== "Admin") {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Role not permitted for this action" } });
    }
    next();
  };
}

/**
 * Gates a route by USERS.MODULES, AppSheet-style: permissions are read LIVE from
 * the sheet (15s cache) on every request rather than trusted from the JWT, so an
 * admin editing the MODULES cell takes effect within seconds — no re-login needed.
 * A missing/inactive USERS row means access was revoked entirely.
 */
export function requireModule(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
    }
    try {
      const perms = await getPermissions(req.user.email);
      if (!perms) {
        return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Account inactive or removed" } });
      }
      if (perms.modules !== "ALL" && !perms.modules.includes(moduleKey)) {
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
    const perms = await getPermissions(req.user.email);
    if (!perms?.canDelete) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Not permitted to delete orders" } });
    }
    next();
  } catch (err) {
    next(err);
  }
}
