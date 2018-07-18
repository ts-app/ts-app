import { ConsoleLogService } from '../src'

describe('ConsoleLogService', () => {
  it('works', () => {
    const logService = new ConsoleLogService()
    logService.log('hello, log')
    logService.debug('hello, debug')
    logService.error('hello, error')
    logService.error('hello, error', { numberVal: 123, booleanVal: true, stringVal: 'bob' })
  })
})
