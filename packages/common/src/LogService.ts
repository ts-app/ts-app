/**
 * A LogService is used to write log and error messages.
 */
export abstract class LogService {
  abstract log (message: string): void

  abstract error (message: string, error?: any): void

  abstract debug (message: string | object): void
}
