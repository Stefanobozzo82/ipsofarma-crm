/** Errore applicativo con status HTTP esplicito — lo lancia un handler,
 * lo traduce in risposta il middleware errorHandler. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string, code = "bad_request") {
    return new AppError(400, code, message);
  }
  static unauthorized(message = "Autenticazione richiesta") {
    return new AppError(401, "unauthorized", message);
  }
  static forbidden(message = "Non autorizzato a compiere questa azione") {
    return new AppError(403, "forbidden", message);
  }
  static notFound(message = "Risorsa non trovata") {
    return new AppError(404, "not_found", message);
  }
  static conflict(message: string) {
    return new AppError(409, "conflict", message);
  }
}
