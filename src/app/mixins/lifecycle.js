import emitAsync from 'emit-async'
import mapValues from 'lodash/mapValues'

export default mapValues({
  start: 'started',
  stop: 'stopped'
}, (endEvent, beginEvent) => function () {
  return this::emitAsync(beginEvent).then(() => {
    this.emit(endEvent)
  })
})
