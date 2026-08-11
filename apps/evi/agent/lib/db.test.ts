import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { databaseUrl, isDbConfigured, getDb } from './db'

const NAMES = ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL'] as const

describe('databaseUrl', () => {
  beforeEach(() => {
    for (const name of NAMES) delete process.env[name]
  })
  afterEach(() => {
    for (const name of NAMES) delete process.env[name]
  })

  it('is null when no connection string is set', () => {
    expect(databaseUrl()).toBeNull()
    expect(isDbConfigured()).toBe(false)
  })

  it('prefers DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://a/b'
    process.env.POSTGRES_URL = 'postgres://c/d'
    process.env.POSTGRESQL_URL = 'postgres://e/f'
    expect(databaseUrl()).toBe('postgres://a/b')
    expect(isDbConfigured()).toBe(true)
  })

  it('falls back to POSTGRES_URL then POSTGRESQL_URL', () => {
    process.env.POSTGRES_URL = 'postgres://c/d'
    expect(databaseUrl()).toBe('postgres://c/d')
    process.env.POSTGRESQL_URL = 'postgres://e/f'
    expect(databaseUrl()).toBe('postgres://c/d')
  })

  it('treats an empty string as unset', () => {
    process.env.DATABASE_URL = ''
    expect(databaseUrl()).toBeNull()
    expect(isDbConfigured()).toBe(false)
  })
})

describe('getDb', () => {
  beforeEach(() => {
    for (const name of NAMES) delete process.env[name]
  })
  afterEach(() => {
    for (const name of NAMES) delete process.env[name]
  })

  it('is null when not configured instead of throwing', () => {
    expect(getDb()).toBeNull()
  })
})
