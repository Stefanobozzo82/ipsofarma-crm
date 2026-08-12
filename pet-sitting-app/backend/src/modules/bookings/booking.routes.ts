import { cancelBookingSchema, createBookingSchema, declineBookingSchema } from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as bookingService from "./booking.service";

export const bookingRoutes = Router();

bookingRoutes.use(requireAuth);

bookingRoutes.post("/", validateBody(createBookingSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.createBooking(req.supabase!, req.user!.id, req.body);
    res.status(201).json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const bookings = await bookingService.listMyBookings(req.supabase!, status);
    res.json({ data: bookings });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.get("/:id", async (req, res, next) => {
  try {
    const booking = await bookingService.getBookingById(req.supabase!, req.params.id);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.patch("/:id/accept", async (req, res, next) => {
  try {
    const booking = await bookingService.acceptBooking(req.supabase!, req.params.id, req.user!.id);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.patch("/:id/decline", validateBody(declineBookingSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.declineBooking(req.supabase!, req.params.id, req.user!.id, req.body);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.patch("/:id/cancel", validateBody(cancelBookingSchema), async (req, res, next) => {
  try {
    const booking = await bookingService.cancelBooking(req.supabase!, req.params.id, req.user!.id, req.body);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/pay", async (req, res, next) => {
  try {
    const result = await bookingService.createPaymentIntent(req.supabase!, req.params.id, req.user!.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
