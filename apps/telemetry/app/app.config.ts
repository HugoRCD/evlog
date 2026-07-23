export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
    // Press feedback: every button should feel acknowledged the instant it's
    // clicked (Emil Kowalski's design-eng guidance — `active:scale` on
    // pressable elements). `transition-colors` is replaced (not appended)
    // with an explicit property list so it keeps animating hover/active
    // color changes while also covering the new `transform` press effect —
    // Tailwind's own `transition-colors` and `transition-transform`
    // utilities both set `transition-property` and would otherwise clobber
    // each other.
    button: {
      slots: {
        base: 'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
      },
    },
  },
})
