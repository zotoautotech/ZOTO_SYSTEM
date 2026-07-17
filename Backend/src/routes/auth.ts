import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { readTable } from "../services/sheets.js";

export const authRouter = Router();

const loginSchema = z.object({ email: z.string().email() });

/**
 * MVP login: email must exist + be ACTIVE in the USERS tab. No password yet —
 * see docs/01-PRD.md §9 open question on auth method (Google Sign-In vs email/password).
 */
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email } = loginSchema.parse(req.body);
    const users = await readTable(env.sheets.transactions, "USERS", { refresh: true });
    const user = users.find(
      (u) => u.EMAIL?.toLowerCase() === email.toLowerCase() && u.ACTIVE === "Yes"
    );

    if (!user) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Email not recognized or inactive" } });
    }

    const payload = { email: user.EMAIL, name: user.NAME, role: user.ROLE };
    const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
});
