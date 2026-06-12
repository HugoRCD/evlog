import { defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  throw new Error('Database connection failed: password invalid')
})
