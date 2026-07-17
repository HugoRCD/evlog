import { runMain } from 'citty'
import { showUsage } from './core/usage'
import { main } from './index'

runMain(main, { showUsage })
