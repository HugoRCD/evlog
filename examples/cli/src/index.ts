#!/usr/bin/env bun
import { exitWithError, parseCliError } from '@evlog/cli'
import { runMain } from '@evlog/cli/citty'
import { setup } from './evlog'
import { main } from './commands'

runMain(main, setup)
  .then(() => setup.flush())
  .catch((error: unknown) => {
    if (process.env.DEBUG) {
      console.error(parseCliError(error))
    }
    exitWithError(error)
  })
