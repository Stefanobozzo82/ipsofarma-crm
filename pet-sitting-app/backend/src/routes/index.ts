import { Router } from "express";
import { adminRoutes } from "../modules/admin/admin.routes";
import { authRoutes } from "../modules/auth/auth.routes";
import { bookingRoutes } from "../modules/bookings/booking.routes";
import { meetGreetRoutes } from "../modules/bookings/meet-greet.routes";
import { petsRoutes } from "../modules/pets/pets.routes";
import { searchRoutes } from "../modules/search/search.routes";
import { sittersRoutes } from "../modules/sitters/sitters.routes";
import { usersRoutes } from "../modules/users/users.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/users", usersRoutes);
apiRouter.use("/pets", petsRoutes);
apiRouter.use("/sitters", sittersRoutes);
apiRouter.use("/search", searchRoutes);
apiRouter.use("/bookings", bookingRoutes);
apiRouter.use("/meet-greets", meetGreetRoutes);
apiRouter.use("/admin", adminRoutes);

// /webhooks è montato direttamente in app.ts (richiede il raw body, non JSON parsato)
// Prossimo: /conversations (chat), notifiche push
