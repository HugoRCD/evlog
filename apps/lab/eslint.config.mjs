import { createConfig } from '@hrcd/eslint-config'

export default createConfig({}, {
  rules: {
    // Pure formatting; clashes with `<pre><code>` blocks where a leading newline
    // is rendered as visible whitespace. Project consensus: not worth the noise.
    'vue/multiline-html-element-content-newline': 'off',
    // The default forces an empty line at the start of every class — pure style
    // noise with zero defect-prevention value.
    'padded-blocks': ['error', { blocks: 'never', switches: 'never' }],
  },
})
