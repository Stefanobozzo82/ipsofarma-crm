import {
  cancelBookingSchema,
  createBookingSchema,
  createDisputeSchema,
  createReviewSchema,
  createServiceUpdateSchema,
  declineBookingSchema,
  gpsPingSchema,
  requestServicePhotoUploadSchema,
} from "@fido/shared";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import * as reviewService from "../reviews/review.service";
import * as trackingService from "../tracking/tracking.service";
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

bookingRoutes.patch("/:id/start", async (req, res, next) => {
  try {
    const booking = await bookingService.startBooking(req.supabase!, req.params.id, req.user!.id);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.patch("/:id/complete", async (req, res, next) => {
  try {
    const booking = await bookingService.completeBooking(req.supabase!, req.params.id, req.user!.id);
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/reviews", validateBody(createReviewSchema), async (req, res, next) => {
  try {
    const review = await reviewService.createReview(req.supabase!, req.params.id, req.user!.id, req.body);
    res.status(201).json({ data: review });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/disputes", validateBody(createDisputeSchema), async (req, res, next) => {
  try {
    const dispute = await bookingService.openDispute(req.supabase!, req.params.id, req.user!.id, req.body);
    res.status(201).json({ data: dispute });
  } catch (err) {
    next(err);
  }
});

// --- Aggiornamenti durante il servizio (foto/note) ---

bookingRoutes.get("/:id/updates", async (req, res, next) => {
  try {
    const updates = await trackingService.listServiceUpdates(req.supabase!, req.params.id);
    res.json({ data: updates });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/updates", validateBody(createServiceUpdateSchema), async (req, res, next) => {
  try {
    const update = await trackingService.addServiceUpdate(req.supabase!, req.params.id, req.user!.id, req.body);
    res.status(201).json({ data: update });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post(
  "/:id/updates/upload-url",
  validateBody(requestServicePhotoUploadSchema),
  async (req, res, next) => {
    try {
      const result = await trackingService.requestServicePhotoUpload(req.supabase!, req.params.id, req.user!.id, req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

// --- Tracking GPS (dog walking) ---

bookingRoutes.get("/:id/gps", async (req, res, next) => {
  try {
    const track = await trackingService.getGpsTrack(req.supabase!, req.params.id);
    res.json({ data: track });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/gps/start", async (req, res, next) => {
  try {
    const track = await trackingService.startGpsTrack(req.supabase!, req.params.id, req.user!.id);
    res.status(201).json({ data: track });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/gps/ping", validateBody(gpsPingSchema), async (req, res, next) => {
  try {
    const track = await trackingService.pingGpsTrack(req.supabase!, req.params.id, req.user!.id, req.body);
    res.json({ data: track });
  } catch (err) {
    next(err);
  }
});

bookingRoutes.post("/:id/gps/stop", async (req, res, next) => {
  try {
    const track = await trackingService.stopGpsTrack(req.supabase!, req.params.id, req.user!.id);
    res.json({ data: track });
  } catch (err) {
    next(err);
  }
});
