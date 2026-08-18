import {
  requestDocumentUploadSchema,
  requestPayoutSchema,
  setSitterAvailabilitySchema,
  setSitterServicesSchema,
  sitterApplySchema,
  updateSitterProfileSchema,
} from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as reviewService from "../reviews/review.service";
import * as stripeConnectService from "../stripe-connect/stripe-connect.service";
import * as sittersService from "./sitters.service";

export const sittersRoutes = Router();

// Rotte pubbliche: nessuna auth richiesta.
sittersRoutes.get("/:id/public", async (req, res, next) => {
  try {
    const profile = await sittersService.getPublicSitterProfile(req.params.id);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.get("/:id/reviews", async (req, res, next) => {
  try {
    const reviews = await reviewService.listSitterReviews(req.params.id);
    res.json({ data: reviews });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.post("/apply", requireAuth, validateBody(sitterApplySchema), async (req, res, next) => {
  try {
    const profile = await sittersService.applyAsSitter(req.supabase!, req.user!.id, req.body);
    res.status(201).json({ data: profile });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.get("/me", requireAuth, async (req, res, next) => {
  try {
    const profile = await sittersService.getMySitterProfile(req.supabase!, req.user!.id);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.patch("/me", requireAuth, validateBody(updateSitterProfileSchema), async (req, res, next) => {
  try {
    const profile = await sittersService.updateMySitterProfile(req.supabase!, req.user!.id, req.body);
    res.json({ data: profile });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.post(
  "/me/documents/upload-url",
  requireAuth,
  validateBody(requestDocumentUploadSchema),
  async (req, res, next) => {
    try {
      const result = await sittersService.requestDocumentUpload(req.supabase!, req.user!.id, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

sittersRoutes.get("/me/services", requireAuth, async (req, res, next) => {
  try {
    const services = await sittersService.listMyServices(req.supabase!, req.user!.id);
    res.json({ data: services });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.put("/me/services", requireAuth, validateBody(setSitterServicesSchema), async (req, res, next) => {
  try {
    const services = await sittersService.setMyServices(req.supabase!, req.user!.id, req.body);
    res.json({ data: services });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.get("/me/availability", requireAuth, async (req, res, next) => {
  try {
    const availability = await sittersService.listMyAvailability(req.supabase!, req.user!.id);
    res.json({ data: availability });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.put(
  "/me/availability",
  requireAuth,
  validateBody(setSitterAvailabilitySchema),
  async (req, res, next) => {
    try {
      const availability = await sittersService.setMyAvailability(req.supabase!, req.user!.id, req.body);
      res.json({ data: availability });
    } catch (err) {
      next(err);
    }
  },
);

sittersRoutes.post("/me/stripe/onboarding-link", requireAuth, async (req, res, next) => {
  try {
    const result = await stripeConnectService.createOnboardingLink(req.user!.id, req.user!.email);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.get("/me/payouts", requireAuth, async (req, res, next) => {
  try {
    const summary = await stripeConnectService.getPayoutSummary(req.supabase!, req.user!.id);
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
});

sittersRoutes.post("/me/payouts/request", requireAuth, validateBody(requestPayoutSchema), async (req, res, next) => {
  try {
    const payout = await stripeConnectService.requestPayout(req.user!.id, req.body);
    res.status(201).json({ data: payout });
  } catch (err) {
    next(err);
  }
});
