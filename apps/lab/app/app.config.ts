export default defineAppConfig({
  // Matches the docs site, so a staged component renders in the colours it was
  // designed against rather than Nuxt UI's defaults.
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
  },
})
