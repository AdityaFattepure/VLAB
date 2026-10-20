export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function notFound(message = 'Not found'): never {
  throw new HttpError(404, message);
}

export function forbidden(message = 'Forbidden'): never {
  throw new HttpError(403, message);
}

export function conflict(message = 'Conflict'): never {
  throw new HttpError(409, message);
}

export function payloadTooLarge(message = 'Payload too large'): never {
  throw new HttpError(413, message);
}

export function unsupportedMediaType(message = 'Unsupported media type'): never {
  throw new HttpError(415, message);
}

export function badGateway(message = 'Bad gateway'): never {
  throw new HttpError(502, message);
}
