import { defineSchedule } from 'eve/schedules'
import slack from '../channels/slack'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  cron: '0 7 * * 1,4',
  run: maintainerRun(slack, 'Upstream sync', 'Load the upstream-sync skill and check the eve and Vercel Connect ecosystem for updates. Open draft PRs for anything warranted.'),
})
