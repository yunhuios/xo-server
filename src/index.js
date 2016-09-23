#!/usr/bin/env node

var info = require('./log').info('bootstrap')
var warn = require('./log').warning('bootstrap')

process.on('unhandledRejection', reason => {
  warn('possibly unhandled rejection', reason)
})

;(({ prototype }) => {
  const { emit } = prototype
  prototype.emit = function (event, error) {
    (event === 'error' && !this.listenerCount(event))
      ? warn('unhandled error event', error)
      : emit.apply(this, arguments)
  }
})(require('events').EventEmitter)

const Bluebird = require('bluebird')
Bluebird.longStackTraces()
global.Promise = Bluebird

// -------------------------------------------------------------------

;(async args => {
  const config = await require('app-conf').load('xo-server')

  const webServer = new (require('http-server-plus'))()

  const readFile = Bluebird.promisify(require('fs').readFile)
  await Promise.all(require('lodash/map')(
    config.http.listen,
    async ({
      certificate,

      // The properties was called `certificate` before.
      cert = certificate,

      key,
      ...opts
    }) => {
      if (cert && key) {
        [ opts.cert, opts.key ] = await Promise.all([
          readFile(cert),
          readFile(key)
        ])
      }

      try {
        const niceAddress = await webServer.listen(opts)
        info(`Web server listening on ${niceAddress}`)
      } catch (error) {
        if (error.niceAddress) {
          warn(`Web server could not listen on ${error.niceAddress}`)

          const { code } = error
          if (code === 'EACCES') {
            warn('  Access denied.')
            warn('  Ports < 1024 are often reserved to privileges users.')
          } else if (code === 'EADDRINUSE') {
            warn('  Address already in use.')
          }
        } else {
          warn('Web server could not listen', error)
        }
      }
    }
  ))

  try {
    const { group, user } = config
    group != null && process.setgid(group)
    user != null && process.setuid(user)
  } catch (error) {
    warn('failed to change group/user', error)
  }
})(process.argv.slice(2)).catch(error => {
  warn('fatal error', error)
})
