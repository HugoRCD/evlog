import { createConfig } from '@hrcd/eslint-config'

export default createConfig({}, {
  rules: {
    // Augmentable interfaces (`declare module 'evlog' { interface X {} }`) are
    // a first-class TS pattern and not catchable by this style rule.
    '@typescript-eslint/no-empty-object-type': 'off',
    // Pure formatting; clashes with `<pre><code>` blocks where a leading newline
    // is rendered as visible whitespace. Project consensus: not worth the noise.
    'vue/multiline-html-element-content-newline': 'off',
  },
})
