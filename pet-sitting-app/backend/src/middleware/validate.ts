import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/** Valida req.body contro uno schema Zod condiviso (@fido/shared) e lo
 * sostituisce con i dati parsati (coerced/default inclusi). Gli errori di
 * validazione arrivano formattati a errorHandler. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
