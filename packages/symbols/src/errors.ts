// Closed error set of @strip/symbols (R8.1).
export const SYMBOL_ERROR_CODES = [
  "INVALID_INPUT",
  "PACKET_TOO_LARGE",
  "ENCODE_FAILED",
  "UNSUPPORTED_ENVIRONMENT",
] as const;
export type SymbolErrorCode = (typeof SYMBOL_ERROR_CODES)[number];
export class SymbolError extends Error {
  readonly code: SymbolErrorCode;
  constructor(code: SymbolErrorCode, message: string) {
    super(message.length > 0 ? message : code);
    this.name = "SymbolError";
    this.code = code;
  }
}
