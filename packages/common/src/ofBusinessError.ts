import { Observable, of } from 'rxjs'
import { BusinessError } from './BusinessError'

/**
 * Returns an observable value with the given error message.
 *
 * @param {string} message
 * @return {Observable<{error: BusinessError}>}
 */
export const ofBusinessError = (message: string): Observable<{ error: BusinessError }> => of({ error: message })
