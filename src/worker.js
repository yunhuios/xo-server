const METHODS = {
  add: ([ a, b ]) => a + b,
  sleep: duration => new Promise(resolve => setTimeout(resolve, duration))
}

process.on('message', ({ id, method, arg }) => {
  const fn = METHODS[method]
  if (!fn) {
    return process.send(new Error('no such method'))
  }

  new Promise(resolve => resolve(fn(arg))).then(
    result => process.send({ id, result }),
    error => {
      console.error(error)
      process.send({ id, error })
    }
  ).catch(error => {
    console.error('worker error', error)
  })
})
