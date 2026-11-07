export class InputError extends Error {
  constructor(
    message: string,
    public readonly field = "",
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "InputError";
  }
}
