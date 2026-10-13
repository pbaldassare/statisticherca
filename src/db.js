import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import pg from 'pg'

const execFileAsync = promisify(execFile)
const projectRef = 'uanazxrxtzcuircypklo'

let pool = null

function onWorker() {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'
}

async function queryOnce(sql) {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const result = await client.query(sql)
    return result.rows
  } finally {
    await client.end()
  }
}

function getPool() {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 4,
    })
  }
  return pool
}

export async function query(sql, { timeout = 180_000 } = {}) {
  if (process.env.DATABASE_URL && onWorker()) {
    return queryOnce(sql)
  }
  const activePool = getPool()
  if (activePool) {
    const result = await activePool.query(sql)
    return result.rows
  }
  if (onWorker()) {
    throw new Error('DATABASE_URL non configurato')
  }

  const dir = mkdtempSync(join(tmpdir(), 'rca-stats-'))
  const file = join(dir, 'query.sql')
  writeFileSync(file, sql)
  try {
    const { stdout } = await execFileAsync(
      'supabase',
      ['db', 'query', '--linked', '--project-ref', projectRef, '-f', file],
      { maxBuffer: 64 * 1024 * 1024, timeout },
    )
    const start = stdout.indexOf('{')
    if (start < 0) throw new Error(stdout.slice(0, 400) || 'Risposta database vuota')
    const parsed = JSON.parse(stdout.slice(start))
    if (Array.isArray(parsed.rows)) return parsed.rows
    throw new Error('Risposta database non riconosciuta')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
