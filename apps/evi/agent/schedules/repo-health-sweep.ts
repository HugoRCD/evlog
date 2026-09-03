import { defineSchedule } from 'eve/schedules'
import slack from '../channels/slack'
import { maintainerRun } from '../lib/schedule'

export default defineSchedule({
  cron: '0 8 * * 2,5',
  run: maintainerRun(slack, 'Repo health sweep', 'Load the repo-health-sweep skill and run the full sweep over the repository: skills vs reality, docs quality, convention drift, and examples drift. Verify every claim against source on main, then deliver one report with concrete findings, each citing the file and the rule or source it contradicts, plus proposed diffs for the easy ones. Open draft PRs for the mechanical fixes and Linear issues for the findings that need a decision.'),
})
