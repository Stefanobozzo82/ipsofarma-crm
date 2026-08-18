import { approveSitterSchema, moderateReviewSchema, resolveDisputeSchema } from "@fido/shared";
import { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as adminService from "./admin.service";

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get("/stats", async (_req, res, next) => {
  try {
    res.json({ data: await adminService.getStats() });
  } catch (err) {
    next(err);
  }
});

adminRoutes.get("/sitters/pending", async (_req, res, next) => {
  try {
    res.json({ data: await adminService.listPendingSitters() });
  } catch (err) {
    next(err);
  }
});

adminRoutes.patch("/sitters/:id/approve", validateBody(approveSitterSchema), async (req, res, next) => {
  try {
    await adminService.approveSitter(req.user!.id, req.params.id, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRoutes.get("/reviews", async (_req, res, next) => {
  try {
    res.json({ data: await adminService.listReviewsForModeration() });
  } catch (err) {
    next(err);
  }
});

adminRoutes.patch("/reviews/:id/moderate", validateBody(moderateReviewSchema), async (req, res, next) => {
  try {
    await adminService.moderateReview(req.user!.id, req.params.id, req.body);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

adminRoutes.get("/disputes", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ data: await adminService.listDisputes(status) });
  } catch (err) {
    next(err);
  }
});

adminRoutes.patch("/disputes/:id/resolve", validateBody(resolveDisputeSchema), async (req, res, next) => {
  try {
    const dispute = await adminService.resolveDispute(req.user!.id, req.params.id, req.body);
    res.json({ data: dispute });
  } catch (err) {
    next(err);
  }
});
