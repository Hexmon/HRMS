import { AppError } from "../../platform/errors.js";
import { ErrorCodes } from "#shared";

export const invalidTransition = (from: string, to: string) =>
  new AppError(ErrorCodes.InvalidTransition, `Invalid transition from ${from} to ${to}`, 400, {
    from,
    to
  });
