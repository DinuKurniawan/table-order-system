export class AppError extends Error {
  constructor(
    public code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST" | "CONFLICT" | "INTERNAL_SERVER_ERROR",
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string) {
    super(code, message, code === "UNAUTHORIZED" ? 401 : 403);
    this.name = "AuthError";
  }
}
