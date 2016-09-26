export const consoleLogger = ({ data, level, namespace, message, time }) => {
  const fn = level === 'info' ? console.log : console.warn

  fn(
    '%s - %s - [%s] %s',
    new Date(time).toISOString(),
    namespace,
    level.toUpperCase(),
    message
  )
  data != null && fn(data)
}

export const composeLoggers = (...loggers) => {
  const n = loggers.length
  const compositeLogger = log => {
    for (let i = 0; i < n; ++i) {
      loggers[i](log)
    }
  }

  return compositeLogger
}

export const createMemoryLogger = () => {
  const memoryLogger = log => {
    logs.push(log)
  }
  const logs = memoryLogger.logs = []

  return memoryLogger
}

// -------------------------------------------------------------------

// Store all logs in memory until a real backend is connected.
export let backend = composeLoggers(
  consoleLogger,
  createMemoryLogger()
)

const makeLevel = level => function log (namespace, message, data) {
  if (arguments.length === 1) {
    return (message, data) => log(namespace, message, data)
  }

  backend({
    data,
    level,
    namespace,
    message,
    time: Date.now()
  })
}

export const info = makeLevel('info')
export const warning = makeLevel('warning')
