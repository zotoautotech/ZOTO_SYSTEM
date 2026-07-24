import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { readTable, updateRow } from "../services/sheets.js";
import { getPermissions, parseBool, parseModules } from "../services/permissions.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({ employeeId: z.string().min(1), password: z.string().min(1) });

/**
 * Employee Id + password login against the USERS tab (`Employee Id`, `Password`,
 * `Name`, `Permissions_Process`, `CAN_ADD`, `CAN_EDIT`, `CAN_DELETE` columns).
 * Password is stored plain text — this is an internal MVP, not a hardened auth
 * system. "Admin" in Permissions_Process grants full module access (see
 * `parseModules`).
 */
authRouter.post("/login", async (req, res, next) => {
  try {
    const { employeeId, password } = loginSchema.parse(req.body);
    const users = await readTable(env.sheets.transactions, "USERS", { refresh: true });
    const user = users.find(
      (u) => u["Employee Id"]?.trim().toLowerCase() === employeeId.trim().toLowerCase()
    );

    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "ID not recognized" } });
    }
    if (!user.Password || user.Password !== password) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Incorrect password" } });
    }

    const payload = {
      employeeId: user["Employee Id"],
      name: user.Name,
      modules: parseModules(user.Permissions_Process),
      canAdd: parseBool(user.CAN_ADD),
      canEdit: parseBool(user.CAN_EDIT),
      canDelete: parseBool(user.CAN_DELETE),
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
});

/**
 * Live permission refresh, AppSheet-style: the frontend polls this so an admin
 * editing Permissions_Process/CAN_ADD/CAN_EDIT/CAN_DELETE in the USERS sheet
 * takes effect within seconds for already-logged-in users — no re-login needed.
 */
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const perms = await getPermissions(req.user!.employeeId);
    if (!perms) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Account inactive or removed" } });
    }
    res.json({
      employeeId: req.user!.employeeId,
      name: req.user!.name,
      modules: perms.modules,
      canAdd: perms.canAdd,
      canEdit: perms.canEdit,
      canDelete: perms.canDelete,
    });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4),
});

/**
 * Self-service password change: the doer edits their own Password cell in the USERS
 * tab (row matched on their own JWT `employeeId`, so nobody can target another row).
 * Requires the current password to match first.
 */
authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const users = await readTable(env.sheets.transactions, "USERS", { refresh: true });
    const user = users.find(
      (u) => u["Employee Id"]?.trim().toLowerCase() === req.user!.employeeId.trim().toLowerCase()
    );
    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Account inactive or removed" } });
    }
    if (user.Password !== currentPassword) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Current password is incorrect" } });
    }

    await updateRow(env.sheets.transactions, "USERS", "Employee Id", user["Employee Id"], { Password: newPassword });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
