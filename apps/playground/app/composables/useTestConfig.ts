import { testConfig } from '~/config/tests.config'
import type { TestConfig, TestSection } from '~/config/tests.config'

export function useTestConfig() {
  const sections = computed(() => testConfig.sections)

  /**
   * Get a section by ID
   */
  const getSection = (id: string): TestSection | undefined => {
    return sections.value.find(s => s.id === id)
  }

  /**
   * Get a test by section ID and test ID
   */
  const getTest = (sectionId: string, testId: string): TestConfig | undefined => {
    const section = getSection(sectionId)
    return section?.tests.find(t => t.id === testId)
  }

  /**
   * Get all tests across all sections
   */
  const getAllTests = computed(() => {
    return sections.value.flatMap(section => section.tests)
  })

  return {
    sections,
    getSection,
    getTest,
    getAllTests,
  }
}
