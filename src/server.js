import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { filtersFromSearch, loadDashboard, loadMeta } from './stats.js'

loadEnv()

const port = Number(process.env.PORT || 8787)
const publicDir = join(import.meta.dirname, '..', 'public')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`)
  console.log(request.method, url.pathname)
  try {
    if (url.pathname === '/api/meta') {
      return sendJson(response, await loadMeta())
    }
    if (url.pathname === '/api/dashboard') {
      const filters = await resolveFilters(url.searchParams)
      const dashboard = await loadDashboard(filters)
      return sendJson(response, { filters, ...dashboard })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405)
      response.end()
      return
    }
    const filePath = safeFile(url.pathname)
    const body = await readFile(filePath)
    response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream' })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch (error) {
    if (error.code === 'ENOENT') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Pagina non trovata')
      return
    }
    console.error(error)
    sendJson(response, { error: 'Impossibile leggere le statistiche' }, 500)
  }
})

server.listen(port, () => {
  console.log(`Statistiche RCA su http://localhost:${port}`)
})

async function resolveFilters(searchParams) {
  const requested = filtersFromSearch(searchParams)
  if (requested.from && requested.to) return requested
  const meta = await loadMeta()
  const to = meta.max_date || romeToday()
  const from = meta.min_date || addDays(to, -30)
  return { ...requested, from, to }
}

function safeFile(pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  if (requested.includes('..')) {
    const error = new Error('Percorso non valido')
    error.code = 'ENOENT'
    throw error
  }
  const filePath = normalize(join(publicDir, requested))
  if (!filePath.startsWith(publicDir)) {
    const error = new Error('Percorso non valido')
    error.code = 'ENOENT'
    throw error
  }
  return filePath
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function romeToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function loadEnv() {
  const path = join(import.meta.dirname, '..', '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
