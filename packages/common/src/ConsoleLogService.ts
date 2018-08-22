import { LogService } from './LogService'

/**
 * LogService implementation that writes messages to console.
 */
export class ConsoleLogService extends LogService {
  error (message: string, error?: any): void {
    if (error) {
      console.error(message, error)
    } else {
      console.error(message)
    }
  }

  log (message: string): void {
    if (typeof message === 'string') {
      console.log(message)
    } else {
      console.log(JSON.stringify(message, null, 2))
    }
  }

  debug (message: string | object): void {
    if (typeof message === 'string') {
      console.debug(message)
    } else {
      console.debug(JSON.stringify(message, null, 2))
    }
  }
}
