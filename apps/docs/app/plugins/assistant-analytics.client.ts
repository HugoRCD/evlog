/**
 * Analytics for surfaces owned by upstream modules (the docus assistant, the
 * Nuxt UI search palette): their shared state is observable from outside, so
 * events come from watchers instead of forked components.
 */
export default defineNuxtPlugin(() => {
  const { isOpen, messages, faqQuestions } = useAssistant()

  // `isOpen` is restored from localStorage on page load; that first restore is
  // not a user action and would count one open per navigation.
  const restoredOpen = localStorage.getItem('assistant-open') === 'true'
  let sawRestore = false
  watch(isOpen, (open) => {
    if (!open) return
    if (restoredOpen && !sawRestore) {
      sawRestore = true
      return
    }
    trackEvent('assistant_opened')
  })

  let lastCount = messages.value.length
  watch(() => messages.value.length, (count) => {
    const last = messages.value[messages.value.length - 1]
    if (count > lastCount && last?.role === 'user') {
      const question = last.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join(' ')
        .trim()
      const faqItems = faqQuestions.value.flatMap(category => category.items)
      trackEvent('assistant_question_asked', {
        question: question.slice(0, 500),
        source: faqItems.includes(question) ? 'faq' : 'typed',
      })
    }
    lastCount = count
  })

  const { open: searchOpen } = useContentSearch()
  watch(searchOpen, (open) => {
    if (open) trackEvent('search_opened')
  })
})
