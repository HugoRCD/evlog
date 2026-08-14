// A declared subagent inherits nothing from the root, sandbox included, and
// the framework default has no checkout. Both content subagents read and write
// pages in the repository, so they share the root's workspace.
export { default } from '../../../sandbox'
