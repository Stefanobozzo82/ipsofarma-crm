import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/app-error";
import { logger } from "../lib/logger";
import { env } from "../config/env";

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: `Rotta non trovata: ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Dati non validi",
        fields: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  logger.error("Errore non gestito", err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Si è verificato un errore imprevisto",
      ...(env.NODE_ENV === "development" && err instanceof Error ? { detail: err.message } : {}),
    },
  });
}
