import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // When the ValidationPipe rejects a request it sets `message` to an array
    // of per-field constraint strings. Preserve that array so API consumers
    // can display field-level feedback instead of a generic "Bad Request".
    const rawMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message;

    const isValidationError =
      status === HttpStatus.BAD_REQUEST && Array.isArray(rawMessage);

    const errorResponse: Record<string, unknown> = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      // For validation failures expose a stable summary string plus the
      // per-field `errors` array. For all other errors keep a plain string.
      message: isValidationError
        ? 'Validation failed'
        : Array.isArray(rawMessage)
          ? rawMessage.join(', ')
          : rawMessage || 'An error occurred',
      error:
        typeof exceptionResponse === 'object' &&
        (exceptionResponse as any).error
          ? (exceptionResponse as any).error
          : HttpStatus[status],
    };

    if (isValidationError) {
      errorResponse.errors = rawMessage;
    }

    this.logger.error(
      `HTTP Exception: ${request.method} ${request.url} - Status: ${status} - Message: ${errorResponse.message}`,
    );

    response.status(status).json(errorResponse);
  }
}
