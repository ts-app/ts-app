import { LogService } from './LogService'

/**
 * LogService implementation that writes messages to console.
 */
export class ConsoleLogService extends LogService {
  error (message: string, error?: any): void {
    if (error) {
      console.error(message)
    } else {
      console.error(message, error)
    }
  }

  log (message: string): void {
    console.log(message)
  }

  debug (message: string | object): void {
    console.debug(message)
  }
}
