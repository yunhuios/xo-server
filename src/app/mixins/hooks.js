import emitAsync from 'emit-async'
import { noop } from 'lodash'

const makeSingletonEvent = (triggerEvent, postEvent) => function () {
  this[triggerEvent] = noop

  return this::emitAsync(triggerEvent).then(() => {
    this.removeAllListeners(triggerEvent)
    this.emit(postEvent)
    this.removeAllListeners(postEvent)
  })
}

export default {
  // Run *clean* async listeners.
  //
  // They normalize existing data, clear invalid entries, etc.
  clean () {
    return this::emitAsync('clean')
  },

  // Run *start* async listeners.
  //
  // They initialize the application.
  start: makeSingletonEvent('start', 'started'),

  // Run *stop* async listeners.
  //
  // They close connections, unmount file systems, save states, etc.
  stop: makeSingletonEvent('stop', 'stopped')
}
