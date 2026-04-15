export default defineAppConfig({
  navigation: {
    sub: 'header',
  },
  github: {
    rootDir: 'apps/docs',
  },
  seo: {
    titleTemplate: '%s - evlog',
    title: 'evlog',
    description: 'Wide events and structured errors for TypeScript. One log per request, full context, errors that explain why and how to fix.',
  },
  assistant: {
    icons: {
      trigger: 'i-custom:ai'
    },
    faqQuestions: [
      {
        category: 'Getting Started',
        items: [
          'What is evlog?',
          'How do I install evlog?',
          'How do I use useLogger?',
        ],
      },
      {
        category: 'Core Features',
        items: [
          'What are wide events?',
          'How do I create structured errors?',
          'How do I use parseError?',
        ],
      },
      {
        category: 'Production',
        items: [
          'How do I configure sampling?',
          'How do I send logs to Axiom?',
          'How do I send logs to PostHog?',
        ],
      },
    ],
  },
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    prose: {
      codeIcon: {
        'nuxt': 'i-vscode-icons-file-type-nuxt',
        'nuxt / nitro': 'i-vscode-icons-file-type-nuxt',
        'next.js': 'i-simple-icons-nextdotjs',
        'express': 'i-simple-icons-express',
        'hono': 'i-simple-icons-hono',
        'fastify': 'i-simple-icons-fastify',
        'elysia': 'i-custom:elysia',
        'nestjs': 'i-simple-icons-nestjs',
        'standalone': 'i-lucide-box',
        'nitro': 'i-custom:nitro',
      },
    },
    button: {
      slots: {
        base: 'active:translate-y-px transition-transform duration-300',
      },
    },
    contentToc: {
      defaultVariants: {
        highlightVariant: 'circuit'
      }
    },
    contentSurround: {
      variants: {
        direction: {
          left: {
            linkLeadingIcon: ['group-active:translate-x-0',],
          },
          right: {
            linkLeadingIcon: ['group-active:translate-x-0',],
          },
        },
      },
    }
  },
})
