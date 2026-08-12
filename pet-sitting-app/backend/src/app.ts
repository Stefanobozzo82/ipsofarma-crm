import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/error-handler";
import { webhooksRoutes } from "./modules/webhooks/webhooks.routes";
import { apiRouter } from "./routes";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));

  // Il webhook Stripe verifica la firma sul raw body: va montato PRIMA di
  // express.json(), altrimenti il body arriverebbe già parsato/riserializzato
  // e la verifica fallirebbe sempre. Vedi webhooks.routes.ts.
  app.use("/api/v1/webhooks", webhooksRoutes);

  app.use(express.json({ limit: "2mb" }));
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "fido-backend" });
  });

  app.use("/api/v1", apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
