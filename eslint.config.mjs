import { createConfig } from '@hrcd/eslint-config'

export default createConfig(
  {},
  {
    rules: {
      // Augmentable interfaces (`declare module 'evlog' { interface X {} }`) are
      // a first-class TS pattern and not catchable by this style rule.
      '@typescript-eslint/no-empty-object-type': 'off',
      // Pure formatting; clashes with `<pre><code>` blocks where a leading newline
      // is rendered as visible whitespace. Project consensus: not worth the noise.
      'vue/multiline-html-element-content-newline': 'off',
      // The default forces an empty line at the *start* of every class. That's
      // a stylistic choice with zero defect-prevention value — it just
      // bloats short utility classes. We keep `blocks` and `switches` set to
      // `'never'` (real readability win) but drop the class rule.
      'padded-blocks': ['error', { blocks: 'never', switches: 'never' }],
      'require-await': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Test files can need `vi.mock(...)` calls between imports and the mocked
    // import — that's the documented vitest pattern (mocks are hoisted, but
    // the imported module must resolve *after* the mock is registered).
    // Forcing `import/first` here generates noise without catching real bugs;
    // we still keep `import/no-duplicates`, `import/no-self-import`, etc.
    files: ['packages/evlog/test/**/*.ts'],
    rules: {
      'import/first': 'off',
    },
  },
)
