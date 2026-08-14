import express, { Router } from "express";
import { handleStripeWebhook } from "./webhooks.service";

export const webhooksRoutes = Router();

// express.raw, non express.json: la verifica della firma Stripe richiede il
// body esatto ricevuto sul filo, non l'oggetto ri-serializzato dal parser
// JSON. Per questo questo router è montato in app.ts PRIMA di express.json().
webhooksRoutes.post("/stripe", express.raw({ type: "application/json" }), async (req, res, next) => {
  try {
    await handleStripeWebhook(req.body, req.headers["stripe-signature"] as string | undefined);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});
