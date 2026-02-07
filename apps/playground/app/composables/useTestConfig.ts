import { testConfig } from '~/config/tests.config'
import type { TestConfig, TestSection } from '~/config/tests.config'

export function useTestConfig() {
  const sections = computed(() => testConfig.sections)

  const getSection = (id: string): TestSection | undefined => {
    return sections.value.find(s => s.id === id)
  }

  const getTest = (sectionId: string, testId: string): TestConfig | undefined => {
    const section = getSection(sectionId)
    return section?.tests.find(t => t.id === testId)
  }

  return {
    sections,
    getSection,
    getTest,
  }
}
