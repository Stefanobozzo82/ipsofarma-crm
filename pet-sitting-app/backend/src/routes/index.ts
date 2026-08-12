import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes";
import { petsRoutes } from "../modules/pets/pets.routes";
import { sittersRoutes } from "../modules/sitters/sitters.routes";
import { usersRoutes } from "../modules/users/users.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/pets", petsRoutes);
apiRouter.use("/sitters", sittersRoutes);

// Fase 3+: /search, /bookings, /meet-greets, /conversations, /webhooks, /admin
