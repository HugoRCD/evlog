import { defineCommand } from 'citty'
import { deploy } from './deploy'
import { doctor } from './doctor'
import { pull } from './pull'
import { sync } from './sync'

export const main = defineCommand({
  meta: {
    name: 'evlog-demo',
    version: '0.1.0',
    description: 'Fake CLI to explore @evlog/cli — doctor, pull, sync, deploy',
  },
  subCommands: {
    doctor,
    pull,
    sync,
    deploy,
  },
})
