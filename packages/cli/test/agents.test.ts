import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContext } from '../src/core/context'
import type { CliContext } from '../src/core/context'
import { MARKER_END, MARKER_START, renderBlock, upsertBlock, upsertClaudePointer } from '../src/lib/agents/block'
import { planAgents } from '../src/lib/agents/plan'
import { agentsTelemetryFieldNames, runAgents } from '../src/lib/agents/run'
import { EVLOG_SKILLS, findInstalledSkills, skillsCommand } from '../src/lib/agents/skills'

const tempDirs: string[] = []

async function project(files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-agents-'))
  tempDirs.push(dir)
  for (const [path, contents] of Object.entries(files)) {
    const target = join(dir, path)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, contents, 'utf8')
  }
  return dir
}

/**
 * An empty home, so a run is judged on the project rather than on whatever the
 * machine executing the suite happens to have installed globally.
 */
function fakeContext(cwd: string, home = join(cwd, '__home')): CliContext {
  return createContext({ cwd, home, env: {}, nodeVersion: 'v22.0.0', tty: false, color: false, columns: 80 })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('renderBlock', () => {
  it('wraps the guidance in the markers', () => {
    const block = renderBlock({ framework: 'nuxt', hasSkills: false })

    expect(block.startsWith(MARKER_START)).toBe(true)
    expect(block.trimEnd().endsWith(MARKER_END)).toBe(true)
  })

  it('names the framework-native accessor', () => {
    expect(renderBlock({ framework: 'nuxt', hasSkills: false })).toContain('useLogger(event)')
    expect(renderBlock({ framework: 'tanstack-start', hasSkills: false })).toContain('req.context.log')
    expect(renderBlock({ framework: 'next', hasSkills: false })).toContain('lib/evlog.ts')
  })

  it('falls back to a generic accessor when detection found nothing', () => {
    expect(renderBlock({ framework: null, hasSkills: false })).toContain('`useLogger()` inside a request handler')
  })

  it('names the skill but never the directory it landed in', () => {
    /* Every agent reads a different path, so naming one would be wrong for the
       rest — the skills CLI decides where they go. */
    const block = renderBlock({ framework: 'nuxt', hasSkills: true })

    expect(block).toContain('review-logging-patterns')
    expect(block).not.toContain('.agents/skills')
    expect(block).not.toContain('.claude/skills')
  })
})

describe('upsertBlock', () => {
  it('replaces the block and leaves everything around it alone', () => {
    const source = `# shop\n\nOur rules.\n\n${MARKER_START}\nold\n${MARKER_END}\n\nMore rules.\n`

    const next = upsertBlock(source, `${MARKER_START}\nnew\n${MARKER_END}\n`)

    expect(next).toBe(`# shop\n\nOur rules.\n\n${MARKER_START}\nnew\n${MARKER_END}\n\nMore rules.\n`)
  })

  it('returns null when the block is already exactly this', () => {
    const block = `${MARKER_START}\nsame\n${MARKER_END}\n`

    expect(upsertBlock(`# shop\n\n${block.trimEnd()}\n`, block)).toBeNull()
  })

  it('appends when there are no markers yet', () => {
    const next = upsertBlock('# shop\n\nOur rules.\n', `${MARKER_START}\nnew\n${MARKER_END}\n`)

    expect(next).toBe(`# shop\n\nOur rules.\n\n${MARKER_START}\nnew\n${MARKER_END}\n`)
  })
})

describe('upsertClaudePointer', () => {
  it('creates the pointer when there is no file', () => {
    expect(upsertClaudePointer(null)).toBe('@AGENTS.md\n')
  })

  it('leaves a file that already mentions AGENTS.md alone', () => {
    expect(upsertClaudePointer('See AGENTS.md for the rules.\n')).toBeNull()
  })

  it('appends to a file that does not', () => {
    expect(upsertClaudePointer('# rules\n')).toBe('# rules\n\n@AGENTS.md\n')
  })
})

describe('findInstalledSkills', () => {
  const NO_HOME = join(tmpdir(), 'evlog-cli-agents-no-home')

  it('finds a skill in any agent directory', async () => {
    const root = await project({ '.claude/skills/review-logging-patterns/SKILL.md': '# x\n' })

    expect(findInstalledSkills(root, NO_HOME)).toMatchObject({
      names: ['review-logging-patterns'],
      dirs: ['.claude/skills'],
    })
  })

  it('collects the same skill installed for several agents', async () => {
    const root = await project({
      '.claude/skills/analyze-logs/SKILL.md': '# x\n',
      '.cursor/skills/analyze-logs/SKILL.md': '# x\n',
    })

    expect(findInstalledSkills(root, NO_HOME).dirs).toEqual(['.claude/skills', '.cursor/skills'])
  })

  it('ignores a directory that is not one of ours', async () => {
    const root = await project({ '.claude/skills/something-else/SKILL.md': '# x\n' })

    expect(findInstalledSkills(root, NO_HOME).names).toEqual([])
  })

  it('finds a globally installed skill and marks the scope', async () => {
    /* Somebody who ran `npx skills add -g` months ago must not be told to
       install again in every project they open. */
    const home = await project({ '.claude/skills/analyze-logs/SKILL.md': '# x\n' })
    const root = await project({ 'package.json': '{}' })

    expect(findInstalledSkills(root, home)).toMatchObject({
      names: ['analyze-logs'],
      dirs: ['~/.claude/skills'],
    })
  })

  it('knows every published skill', () => {
    expect([...EVLOG_SKILLS].sort()).toEqual(['analyze-logs', 'build-audit-logs', 'review-logging-patterns'])
  })
})

describe('skillsCommand', () => {
  it('adds every published skill from the docs site by default', () => {
    expect(skillsCommand({ interactive: true }).display).toBe('npx skills add https://www.evlog.dev')
  })

  it('lets the skills CLI ask its own questions when somebody is watching', () => {
    /* Which agents to install for is its question, not ours. */
    expect(skillsCommand({ interactive: true }).display).not.toContain('--yes')
    /* Non-interactively it must never block on a prompt nobody will answer. */
    expect(skillsCommand({ interactive: false }).display).toContain('--yes')
  })

  it('always answers npx own install prompt', () => {
    /* Distinct from the flag above: this one is npx being asked whether to
       fetch the skills package, and it blocks even in a run we did not drive. */
    expect(skillsCommand({ interactive: true }).args[0]).toBe('--yes')
  })

  it('passes the scope and the skill selection through', () => {
    const command = skillsCommand({ interactive: true, global: true, skills: ['analyze-logs'] })

    expect(command.display).toBe('npx skills add https://www.evlog.dev --skill analyze-logs --global')
  })

  it('runs npx rather than depending on the package', () => {
    expect(skillsCommand({ interactive: true }).bin).toBe('npx')
  })
})

describe('planAgents', () => {
  it('creates both files in a project that has neither', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    const plan = planAgents({ root, projectName: 'shop', framework: 'nuxt', hasSkills: false })

    expect(plan.actions.map(action => action.relative)).toEqual(['AGENTS.md', 'CLAUDE.md'])
    expect(plan.actions.every(action => action.kind === 'create')).toBe(true)
    expect(plan.actions[0]!.contents).toContain('# shop')
  })

  it('plans no skill files — they are not ours to write', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    const plan = planAgents({ root, projectName: 'shop', framework: 'nuxt', hasSkills: true })

    expect(plan.actions.every(action => !action.relative.includes('skills'))).toBe(true)
  })
})

describe('agents telemetry fields', () => {
  it('never names a field that could carry a path or a project name', () => {
    for (const name of agentsTelemetryFieldNames()) {
      expect(name).toMatch(/^agents[A-Z]/)
      expect(name.toLowerCase()).not.toContain('name')
      expect(name.toLowerCase()).not.toContain('path')
    }
  })

  it('keeps the field names distinct', () => {
    const names = agentsTelemetryFieldNames()

    expect(new Set(names).size).toBe(names.length)
  })
})

describe('runAgents', () => {
  it('writes the block and the pointer, and delegates the skills', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    const result = await runAgents(fakeContext(root), undefined, { noSkills: true })

    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain(MARKER_START)
    expect(await readFile(join(root, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n')
    expect(result.skills).toMatchObject({ status: 'skipped', command: 'npx skills add https://www.evlog.dev --yes' })
  })

  it('is safe to run twice — the second run changes nothing', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    await runAgents(fakeContext(root), undefined, { noSkills: true })
    const first = await readFile(join(root, 'AGENTS.md'), 'utf8')

    const second = await runAgents(fakeContext(root), undefined, { noSkills: true })

    expect(second.written).toHaveLength(0)
    expect(second.already).toEqual(['AGENTS.md is up to date', 'CLAUDE.md already points at AGENTS.md'])
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe(first)
  })

  it('keeps the hand-written parts of an existing AGENTS.md', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'AGENTS.md': '# shop\n\nRun the tests before you push.\n',
    })

    await runAgents(fakeContext(root), undefined, { noSkills: true })

    const contents = await readFile(join(root, 'AGENTS.md'), 'utf8')
    expect(contents).toContain('Run the tests before you push.')
    expect(contents).toContain('## Logging with evlog')
  })

  it('leaves already-installed skills to npx skills update', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      '.claude/skills/review-logging-patterns/SKILL.md': '# x\n',
    })

    const result = await runAgents(fakeContext(root), undefined, {})

    /* Nothing was spawned: an existing install is the skills CLI's to refresh,
       and re-adding it would be us duplicating what it already tracks. */
    expect(result.skills).toMatchObject({
      status: 'already',
      found: ['review-logging-patterns'],
      dirs: ['.claude/skills'],
    })
  })

  it('says so in the plan when the skills are already there', async () => {
    /* Doing nothing quietly reads as having forgotten the step — which is
       exactly how this looked before it was reported. */
    const root = await project({
      'package.json': '{"name":"shop"}',
      '.claude/skills/analyze-logs/SKILL.md': '# x\n',
    })

    const result = await runAgents(fakeContext(root), undefined, {})

    expect(result.already).toContain('evlog skills already installed · .claude/skills')
  })

  it('writes nothing and runs nothing under --dry-run', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    const result = await runAgents(fakeContext(root), undefined, { dryRun: true })

    expect(result.written.length).toBeGreaterThan(0)
    expect(result.skills.status).toBe('skipped')
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
  })

  it('still writes the block when no framework could be detected', async () => {
    const root = await project({ 'package.json': '{"name":"shop"}' })

    const result = await runAgents(fakeContext(root), undefined, { noSkills: true })

    expect(result.framework).toBeNull()
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toContain('One wide event per operation')
  })
})
