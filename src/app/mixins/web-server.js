import { fromCallback } from 'promise-toolbox'

export default class WebServer {
  constructor (app, { webServer }) {
    app.on('stop', () => fromCallback(cb => webServer.close(cb)))
  }
}
