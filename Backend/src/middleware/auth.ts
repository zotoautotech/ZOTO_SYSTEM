import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

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
 * Gates a route by USERS.MODULES. Tokens issued before this claim existed have
 * `modules === undefined` — treated as "ALL" (fail open) so already-logged-in users
 * aren't locked out until their 7-day token naturally expires and they log in again.
 */
export function requireModule(moduleKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
    }
    const modules = req.user.modules ?? "ALL";
    if (modules !== "ALL" && !modules.includes(moduleKey)) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "No access to this module" } });
    }
    next();
  };
}

/**
 * Gates a destructive route by USERS.CAN_DELETE. Unlike requireModule, this fails
 * closed (missing claim = no delete access) since it guards an irreversible action.
 */
export function requireCanDelete(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token" } });
  }
  if (!req.user.canDelete) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Not permitted to delete orders" } });
  }
  next();
}
