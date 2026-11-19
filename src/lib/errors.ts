/** Kode error stabil sesuai ARCHITECTURE bagian 9 (audit S-04). */
export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ALREADY_PROCESSED"
  | "STOCK_INSUFFICIENT"
  | "ORDER_EXPIRED"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "UPLOAD_INVALID"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status: number = 400,
    public fields?: Record<string, string[] | undefined>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
    super(code, message, code === "UNAUTHENTICATED" ? 401 : 403);
    this.name = "AuthError";
  }
}
