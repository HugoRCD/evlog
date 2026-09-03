import { defineSchedule } from 'eve/schedules'
import slack from '../channels/slack'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  cron: '0 5 * * 1-5',
  run: maintainerRun(slack, 'Daily digest', 'Load the daily-digest skill and follow it for the last 24 hours.'),
})
