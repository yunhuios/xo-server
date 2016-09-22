#!/usr/bin/env node

import execPromise from 'exec-promise'

import createWorkerFarm from './workers'

// ===================================================================

// -------------------------------------------------------------------

execPromise(async args => {
  const farm = createWorkerFarm()

  console.time('foo')
  await Promise.all([
    farm.call({ method: 'sleep', arg: 25e2 }).then(() => console.log('foo')),
    farm.call({ method: 'sleep', arg: 25e2 }).then(() => console.log('bar')),
    farm.call({ method: 'sleep', arg: 25e2 }).then(() => console.log('baz'))
  ])
  console.timeEnd('foo')
})
