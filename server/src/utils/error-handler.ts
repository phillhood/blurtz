import { HttpException } from "@nestjs/common";
import { SOCKET_ERROR_CODES, SocketErrorCode, isSocketErrorCode } from "@blurtz/shared";
import { WsValidationError } from "./ws-validation";

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * The typed reason an error carries, for the client to branch on.
 *
 * A Nest exception threads its code through an object response
 * (`new NotFoundException({ code, message })`), which `getResponse()` hands back
 * verbatim. Anything without one is UNKNOWN, which the client treats as
 * transient - so a new failure path is never fatal by accident.
 */
export function getErrorCode(error: unknown): SocketErrorCode {
  if (error instanceof WsValidationError) {
    return SOCKET_ERROR_CODES.INVALID_PAYLOAD;
  }

  if (error instanceof HttpException) {
    const response = error.getResponse();

    if (typeof response === "object" && response !== null) {
      const { code } = response as { code?: unknown };
      if (isSocketErrorCode(code)) {
        return code;
      }
    }
  }

  return SOCKET_ERROR_CODES.UNKNOWN;
}
