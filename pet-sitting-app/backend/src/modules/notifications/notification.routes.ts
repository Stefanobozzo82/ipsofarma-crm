import { registerPushTokenSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as notificationService from "./notification.service";

export const notificationRoutes = Router();

notificationRoutes.use(requireAuth);

notificationRoutes.get("/", async (req, res, next) => {
  try {
    res.json({ data: await notificationService.listMyNotifications(req.supabase!) });
  } catch (err) {
    next(err);
  }
});

notificationRoutes.patch("/:id/read", async (req, res, next) => {
  try {
    await notificationService.markNotificationRead(req.supabase!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

notificationRoutes.patch("/read-all", async (req, res, next) => {
  try {
    await notificationService.markAllNotificationsRead(req.supabase!, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

notificationRoutes.post("/push-tokens", validateBody(registerPushTokenSchema), async (req, res, next) => {
  try {
    await notificationService.registerPushToken(req.supabase!, req.user!.id, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
