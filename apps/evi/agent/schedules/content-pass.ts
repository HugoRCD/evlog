import { defineSchedule } from 'eve/schedules'
import slack from '../channels/slack'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  cron: '0 6 * * 2,5',
  run: maintainerRun(slack, 'Content pass', 'Load the content-pass skill and run one pass over the written corpus: the docs, the landing, the package READMEs, the skills, the AGENTS.md files. Open a single draft PR if anything held, and say so in one line either way.'),
})
