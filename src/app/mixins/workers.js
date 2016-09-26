import { cpus as getCpus } from 'os'
import { fork } from 'child_process'

const MAX = getCpus().length
const WORKER = `${__dirname}/../../worker.js`

class Task {
  constructor (data, resolve, reject) {
    this.data = data
    this.resolve = resolve
    this.reject = reject
  }
}

export default class Workers {
  constructor () {
    this._nWorkers = 0
    this._tasksQueue = []
    this._idleWorker = null
  }

  callWorker (data) {
    return new Promise((resolve, reject) => {
      const task = new Task(data, resolve, reject)

      const worker = this._getWorker()
      if (worker) {
        this._submitTask(worker, task)
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

      return worker
    }
  }

  _submitTask (worker, task) {
    worker.once('message', response => {
      if ('error' in response) {
        task.reject(response.error)
      } else {
        task.resolve(response.result)
      }

      const nextTask = this._tasksQueue.shift()
      if (nextTask) {
        this._submitTask(worker, nextTask)
      } else if (this._idleWorker) {
        worker.kill()
      } else {
        this._idleWorker = worker
      }
    })

    worker.send(task.data)
  }
}
