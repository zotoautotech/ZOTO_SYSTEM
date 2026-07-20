import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { readTable, clearCache } from "../services/sheets.js";
import { getSheetsClient } from "../services/googleAuth.js";

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

/**
 * Email + password login. Password is stored in the USERS tab's PASSWORD column
 * (plain text — this is an internal MVP, not a hardened auth system).
 * A row with no PASSWORD set yet can't log in until it's set via /auth/set-password.
 */
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const users = await readTable(env.sheets.transactions, "USERS", { refresh: true });
    const user = users.find(
      (u) => u.EMAIL?.toLowerCase() === email.toLowerCase() && u.ACTIVE === "Yes"
    );

    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Email not recognized or inactive" } });
    }
    if (!user.PASSWORD) {
      return res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "No password set for this account yet — use Set Password first" },
      });
    }
    if (user.PASSWORD !== password) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Incorrect password" } });
    }

    const payload = {
      email: user.EMAIL,
      name: user.NAME,
      role: user.ROLE,
      modules: parseModules(user.MODULES),
      canDelete: parseBool(user.CAN_DELETE),
    };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
});

const setPasswordSchema = z.object({ email: z.string().email(), password: z.string().min(4) });

/**
 * Self-service first-time password set. Only works while PASSWORD is still empty for
 * that row — once set, changing it requires an Admin to clear the cell in the sheet
 * (there's no "forgot password" flow yet).
 */
authRouter.post("/set-password", async (req, res, next) => {
  try {
    const { email, password } = setPasswordSchema.parse(req.body);
    const users = await readTable(env.sheets.transactions, "USERS", { refresh: true });
    const user = users.find(
      (u) => u.EMAIL?.toLowerCase() === email.toLowerCase() && u.ACTIVE === "Yes"
    );

    if (!user) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Email not recognized or inactive" } });
    }
    if (user.PASSWORD) {
      return res.status(409).json({
        error: { code: "ALREADY_SET", message: "Password already set for this account — ask an Admin to reset it" },
      });
    }

    const sheets = await getSheetsClient();
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.transactions,
      range: "USERS!A1:ZZ1",
    });
    const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h ?? "").trim());
    let passwordColIndex = headers.indexOf("PASSWORD");

    if (passwordColIndex === -1) {
      passwordColIndex = headers.length;
      const colLetter = columnLetter(passwordColIndex);
      await sheets.spreadsheets.values.update({
        spreadsheetId: env.sheets.transactions,
        range: `USERS!${colLetter}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["PASSWORD"]] },
      });
    }

    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.transactions,
      range: "USERS!A:A",
    });
    const emailCol = (dataRes.data.values ?? []).map((r) => r[0]);
    const rowIndex = emailCol.findIndex((v) => v === user.EMAIL);
    if (rowIndex === -1) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Row disappeared, try again" } });
    }

    const colLetter = columnLetter(passwordColIndex);
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheets.transactions,
      range: `USERS!${colLetter}${rowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[password]] },
    });

    clearCache();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * USERS.MODULES: comma-separated module keys (e.g. "punch-order,sale-order"), or
 * blank/"ALL" for unrestricted access — blank defaults to ALL so existing rows
 * aren't locked out until an admin deliberately restricts them.
 */
function parseModules(raw: string | undefined): string[] | "ALL" {
  const value = (raw ?? "").trim();
  if (!value || value.toUpperCase() === "ALL") return "ALL";
  return value
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** USERS.CAN_DELETE: "Yes"/"TRUE"/"1" grants it; blank or anything else defaults to false. */
function parseBool(raw: string | undefined): boolean {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "yes" || value === "true" || value === "1";
}

function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}
