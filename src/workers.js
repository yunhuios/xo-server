import { cpus as getCpus } from 'os'
import { fork } from 'child_process'

const MAX = getCpus().length
const WORKER = `${__dirname}/worker.js`

// Starts the autoincrement id with the JavaScript minimal safe integer to have
// more room before running out of integers (it's very far fetched but a very
// long running process with a LOT of messages could run out).
let nextId = -9007199254740991
const getFreeId = object => {
  let id
  do {
    id = String(nextId++)
  } while (id in object)
  return id
}

class Task {
  constructor (id, method, arg) {
    this.id = id
    this.method = method
    this.arg = arg
  }
}

class Farm {
  constructor () {
    this._deferreds = {}
    this._nWorkers = 0
    this._tasksQueue = []
    this._idleWorker = null
  }

  call (method, arg) {
    return new Promise((resolve, reject) => {
      const deferreds = this._deferreds

      const id = getFreeId(deferreds)
      const task = new Task(id, method, arg)
      deferreds[id] = { resolve, reject }

      const worker = this._getWorker()
      if (worker) {
        worker.send(task)
      } else {
        this._tasksQueue.push(task)
      }
    })
  }

  _getWorker () {
    let worker = this._idleWorker
    if (worker) {
      this._idleWorker = null
      return worker
    }

    if (this._nWorkers < MAX) {
      this._nWorkers++

      worker = fork(WORKER)
      worker.on('error', error => {
        console.error('worker error', error)
      })
      worker.on('exit', (code, signal) => {
        console.log('worker exit', code, signal)
        this._nWorkers--
      })
      worker.on('message', ({ id, error, result }) => {
        const task = this._tasksQueue.shift()
        if (task) {
          worker.send(task)
        } else if (this._idleWorker) {
          worker.kill()
        } else {
          this._idleWorker = worker
        }

        const deferreds = this._deferreds

        const deferred = deferreds[id]
        if (!deferred) {
          throw new Error(`no deferred available for ${id}`)
        }
        delete deferreds[id]

        error
          ? deferred.reject(error)
          : deferred.resolve(result)
      })

      return worker
    }
  }
}

export default () => new Farm()
