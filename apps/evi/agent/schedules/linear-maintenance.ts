import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  // Bump to every other Thursday if the pass proves lighter than expected.
  cron: '0 8 * * 4',
  run: maintainerRun(photon, 'Load the linear-maintenance skill and run the pass over the evlog team Linear backlog: apply the mechanically verifiable fixes for project, priority and label drift, close anything provably shipped, and surface the rest as decisions. Deliver one report as a Linear document with the applied fixes and the open decisions, and post one line per artifact to the thread.'),
})
