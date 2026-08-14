import { loginSchema, oauthExchangeSchema, refreshSchema, signupSchema } from "@fido/shared";
import { Router } from "express";
import { AppError } from "../../lib/app-error";
import { validateBody } from "../../middleware/validate";
import * as authService from "./auth.service";

export const authRoutes = Router();

authRoutes.post("/signup", validateBody(signupSchema), async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/refresh", validateBody(refreshSchema), async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

authRoutes.post("/oauth/:provider", validateBody(oauthExchangeSchema), async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!authService.isSupportedOAuthProvider(provider)) {
      throw AppError.badRequest(`Provider OAuth non supportato: ${provider}. Usa google o apple.`);
    }
    const result = await authService.oauthExchange(provider, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
