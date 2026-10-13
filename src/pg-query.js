import pg from 'pg'

let pool = null

function onWorker() {
  return typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'
}

export async function queryPg(sql) {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL non configurato')
  const ssl = connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false }
  if (onWorker()) return queryOnce(connectionString, ssl, sql)
  const activePool = getPool(connectionString, ssl)
  const result = await activePool.query(sql)
  return result.rows
}

async function queryOnce(connectionString, ssl, sql) {
  const client = new pg.Client({ connectionString, ssl })
  await client.connect()
  try {
    const result = await client.query(sql)
    return result.rows
  } finally {
    await client.end()
  }
}

function getPool(connectionString, ssl) {
  if (!pool) pool = new pg.Pool({ connectionString, ssl, max: 4 })
  return pool
}
