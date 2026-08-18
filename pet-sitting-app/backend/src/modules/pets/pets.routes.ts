import { createPetSchema, updatePetSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as petsService from "./pets.service";

export const petsRoutes = Router();

petsRoutes.use(requireAuth);

petsRoutes.get("/", async (req, res, next) => {
  try {
    const pets = await petsService.listMyPets(req.supabase!, req.user!.id);
    res.json({ data: pets });
  } catch (err) {
    next(err);
  }
});

petsRoutes.post("/", validateBody(createPetSchema), async (req, res, next) => {
  try {
    const pet = await petsService.createPet(req.supabase!, req.user!.id, req.body);
    res.status(201).json({ data: pet });
  } catch (err) {
    next(err);
  }
});

petsRoutes.get("/:id", async (req, res, next) => {
  try {
    const pet = await petsService.getMyPet(req.supabase!, req.params.id);
    res.json({ data: pet });
  } catch (err) {
    next(err);
  }
});

petsRoutes.patch("/:id", validateBody(updatePetSchema), async (req, res, next) => {
  try {
    const pet = await petsService.updateMyPet(req.supabase!, req.params.id, req.body);
    res.json({ data: pet });
  } catch (err) {
    next(err);
  }
});

petsRoutes.delete("/:id", async (req, res, next) => {
  try {
    await petsService.deleteMyPet(req.supabase!, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
