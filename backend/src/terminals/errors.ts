export class TerminalProviderError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "TerminalProviderError";
    this.statusCode = statusCode;
  }
}

export function mapTerminalErrorToHttpStatus(statusCode: number): number {
  if (statusCode === 401 || statusCode === 403) return statusCode;
  if (statusCode >= 400 && statusCode < 500) return 400;
  return 502;
}
