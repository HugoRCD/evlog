import glob from 'eve/tools/glob'

// eve 0.39.0 removed glob from the default tool set; Evi keeps it.
// Since 0.45.0 the provided definition ships from its own entrypoint.
export default glob