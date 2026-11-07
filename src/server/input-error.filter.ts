import { InputError } from "../shared/utils/input-error.js";
import { Catch } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

@Catch(InputError)
export class InputErrorFilter implements ExceptionFilter {
  catch(error: InputError, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(error.statusCode).json({
      statusCode: error.statusCode,
      message: error.message,
      field: error.field,
    });
  }
}
