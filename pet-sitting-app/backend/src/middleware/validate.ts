import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Querystring già validata/coercita da validateQuery — i field
       * numerici/booleani sono già del tipo giusto, non stringhe. */
      validatedQuery?: unknown;
    }
  }
}

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

/** Come validateBody, ma per la querystring (usa z.coerce per numeri/bool
 * dato che arrivano sempre come stringhe): il risultato va in
 * req.validatedQuery, non in req.query, per non litigare con il tipo
 * ParsedQs di Express. */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
