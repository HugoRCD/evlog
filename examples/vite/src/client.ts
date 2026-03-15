import { log } from 'evlog/client'

log.info('app', 'Client loaded')
log.info({ action: 'page_view', path: window.location.pathname })
