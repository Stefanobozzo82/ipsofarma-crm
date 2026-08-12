import { updateUserSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as usersService from "./users.service";

export const usersRoutes = Router();

usersRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const me = await usersService.getMe(req.supabase!, req.user!.id);
    res.json({ data: me });
  } catch (err) {
    next(err);
  }
});

usersRoutes.patch("/me", requireAuth, validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const updated = await usersService.updateMe(req.supabase!, req.user!.id, req.body);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});
