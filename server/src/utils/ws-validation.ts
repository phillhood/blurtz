import { plainToInstance } from "class-transformer";
import { validate, ValidationError } from "class-validator";

export class WsValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join(", "));
    this.name = "WsValidationError";
  }
}

function formatValidationErrors(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
    if (error.children && error.children.length > 0) {
      messages.push(...formatValidationErrors(error.children));
    }
  }
  return messages;
}

export async function validateWsPayload<T extends object>(
  dtoClass: new () => T,
  payload: unknown
): Promise<T> {
  const instance = plainToInstance(dtoClass, payload);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    throw new WsValidationError(formatValidationErrors(errors));
  }

  return instance;
}
