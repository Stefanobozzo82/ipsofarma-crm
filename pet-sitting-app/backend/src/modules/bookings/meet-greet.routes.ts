import { createMeetGreetSchema, updateMeetGreetSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as meetGreetService from "./meet-greet.service";

export const meetGreetRoutes = Router();

meetGreetRoutes.use(requireAuth);

meetGreetRoutes.post("/", validateBody(createMeetGreetSchema), async (req, res, next) => {
  try {
    const meetGreet = await meetGreetService.createMeetGreet(req.supabase!, req.user!.id, req.body);
    res.status(201).json({ data: meetGreet });
  } catch (err) {
    next(err);
  }
});

meetGreetRoutes.get("/", async (req, res, next) => {
  try {
    const meetGreets = await meetGreetService.listMyMeetGreets(req.supabase!);
    res.json({ data: meetGreets });
  } catch (err) {
    next(err);
  }
});

meetGreetRoutes.patch("/:id", validateBody(updateMeetGreetSchema), async (req, res, next) => {
  try {
    const meetGreet = await meetGreetService.updateMeetGreet(req.supabase!, req.params.id, req.user!.id, req.body);
    res.json({ data: meetGreet });
  } catch (err) {
    next(err);
  }
});
