import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import pg from 'pg'

const execFileAsync = promisify(execFile)
const projectRef = 'uanazxrxtzcuircypklo'

let pool = null

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

export async function query(sql) {
  const activePool = getPool()
  if (activePool) {
    const result = await activePool.query(sql)
    return result.rows
  }

  const { stdout } = await execFileAsync(
    'supabase',
    ['db', 'query', '--linked', '--project-ref', projectRef, sql],
    { maxBuffer: 32 * 1024 * 1024, timeout: 90_000 },
  )
  const start = stdout.indexOf('{')
  if (start < 0) throw new Error('Risposta database vuota')
  const parsed = JSON.parse(stdout.slice(start))
  if (Array.isArray(parsed.rows)) return parsed.rows
  throw new Error('Risposta database non riconosciuta')
}
