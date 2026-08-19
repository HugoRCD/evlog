import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  cron: '0 8 * * 3',
  run: maintainerRun(photon, 'Load the self-review skill and run both halves over the repository and your own surface: what has drifted out of coherence, and what capability is missing. Open draft PRs for the mechanical fixes, and Linear issues for the findings and proposals that need a decision.'),
})
