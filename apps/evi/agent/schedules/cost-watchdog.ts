import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  // Monday keeps the report aligned to complete calendar weeks.
  cron: '0 8 * * 1',
  run: maintainerRun(photon, 'Load the cost-watchdog skill and run the weekly cost and model review for the last full week: pull the gateway spend by surface and model, flag drift against the previous week, check the current model landscape, and propose per-surface model adjustments (or state clearly there is nothing to improve). Write the report as a Linear document and post the top finding with the link here.'),
})
