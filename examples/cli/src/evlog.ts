import { setupEvlog } from '@evlog/cli'
import { auditCatalog } from './catalogs/audit'
import { errorCatalog } from './catalogs/errors'
import { createCliDrain } from './drain'

export const setup = setupEvlog({
  service: 'evlog-demo-cli',
  version: '0.1.0',
  redact: true,
  drain: createCliDrain(),
  errorCatalog,
  auditCatalog,
})
