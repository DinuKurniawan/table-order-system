/** Kode error stabil sesuai ARCHITECTURE bagian 9 (audit S-04). */
export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ALREADY_PROCESSED"
  | "STOCK_INSUFFICIENT"
  | "VOUCHER_QUOTA_EXHAUSTED"
  | "ORDER_EXPIRED"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UPLOAD_INVALID"
  | "PASSWORD_CHANGE_REQUIRED"
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
  constructor(
    code: "UNAUTHENTICATED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED",
    message: string
  ) {
    super(code, message, code === "UNAUTHENTICATED" ? 401 : 403);
    this.name = "AuthError";
  }
}
