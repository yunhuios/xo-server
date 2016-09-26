import mixin from 'mixin'
import values from 'lodash/values'
import { EventEmitter } from 'events'

import Mixins from './mixins'

@mixin(values(Mixins))
export default class App extends EventEmitter {}
