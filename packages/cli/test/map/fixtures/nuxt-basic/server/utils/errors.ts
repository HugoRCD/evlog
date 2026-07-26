import { defineErrorCatalog } from 'evlog'

export const orderErrors = defineErrorCatalog('order', {
  NOT_FOUND: {
    status: 404,
    message: 'Order not found',
    why: 'No order matches this id',
    fix: 'Check the id and try again',
  },
})
