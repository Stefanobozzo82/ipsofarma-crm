import { requestDocumentUploadSchema, sitterApplySchema, updateSitterProfileSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as sittersService from "./sitters.service";

export const sittersRoutes = Router();

// Rotta pubblica: nessuna auth richiesta.
sittersRoutes.get("/:id/public", async (req, res, next) => {
  try {
    const profile = await sittersService.getPublicSitterProfile(req.params.id);
    res.json({ data: profile });
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
