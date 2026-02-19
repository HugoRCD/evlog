'use server'

import { withEvlog, useLogger } from '@/lib/evlog'

export const checkout = withEvlog(async (formData: FormData) => {
  const log = useLogger()

  log.set({
    action: 'checkout',
    source: 'server-action',
    item: formData.get('item'),
  })

  return { success: true }
})
