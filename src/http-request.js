import isRedirect from 'is-redirect'
import { assign, isString, startsWith } from 'lodash'
import { request as httpRequest } from 'http'
import { request as httpsRequest } from 'https'
import { stringify as formatQueryString } from 'querystring'
import {
  format as formatUrl,
  parse as parseUrl,
  resolve as resolveUrl
} from 'url'

import { streamToBuffer } from './utils'

// -------------------------------------------------------------------

const raw = opts => {
  let req

  const pResponse = new Promise((resolve, reject) => {
    const {
      body,
      headers: { ...headers } = {},
      protocol,
      query,
      ...rest
    } = opts

    if (headers['content-length'] == null && body != null) {
      let tmp
      if (isString(body)) {
        headers['content-length'] = Buffer.byteLength(body)
      } else if (
        (
          (tmp = body.headers) &&
          (tmp = tmp['content-length']) != null
        ) ||
        (tmp = body.length) != null
      ) {
        headers['content-length'] = tmp
      }
    }

    if (query) {
      rest.path = `${rest.pathname || rest.path || '/'}?${
        isString(query)
          ? query
          : formatQueryString(query)
      }`
    }

    // Some headers can be explicitly removed by setting them to null.
    const headersToRemove = []
    for (const header in headers) {
      if (headers[header] === null) {
        delete headers[header]
        headersToRemove.push(header)
      }
    }

    const secure = protocol && startsWith(protocol.toLowerCase(), 'https')
    let requestFn
    if (secure) {
      requestFn = httpsRequest
    } else {
      requestFn = httpRequest
      delete rest.rejectUnauthorized
    }

    req = requestFn({
      ...rest,
      headers
    })

    for (let i = 0, length = headersToRemove.length; i < length; ++i) {
      req.removeHeader(headersToRemove[i])
    }

    if (body) {
      if (typeof body.pipe === 'function') {
        body.pipe(req)
      } else {
        req.end(body)
      }
    } else {
      req.end()
    }
    req.on('error', reject)
    req.once('response', resolve)
  }).then(response => {
    response.cancel = () => {
      req.abort()
    }
    response.readAll = () => streamToBuffer(response)

    const length = response.headers['content-length']
    if (length) {
      response.length = length
    }

    const code = response.statusCode
    const { location } = response.headers
    if (isRedirect(code) && location) {
      assign(opts, parseUrl(resolveUrl(formatUrl(opts), location)))
      return raw(opts)
    }
    if (code < 200 || code >= 300) {
      const error = new Error(response.statusMessage)
      error.code = code
      Object.defineProperty(error, 'response', {
        configurable: true,
        value: response,
        writable: true
      })

      throw error
    }

    return response
  })
  pResponse.request = req

  return pResponse
}

const httpRequestPlus = (...args) => {
  const opts = {}
  for (let i = 0, length = args.length; i < length; ++i) {
    const arg = args[i]
    assign(opts, isString(arg) ? parseUrl(arg) : arg)
  }

  const pResponse = raw(opts)

  pResponse.cancel = () => {
    const { request } = pResponse
    request.emit('error', new Error('HTTP request canceled!'))
    request.abort()
  }
  pResponse.readAll = () => pResponse.then(response => response.readAll())

  return pResponse
}
export { httpRequestPlus as default }
