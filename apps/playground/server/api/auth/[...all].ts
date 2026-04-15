export default defineEventHandler((event) => {
  return auth.handler(toWebRequest(event))
})
