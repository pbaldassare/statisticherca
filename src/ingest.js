import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const VEICOLI = new Set(['rca_auto', 'rca_moto', 'rca_autocarri'])
const TIPI = new Set(['privato', 'azienda'])
const FRAZIONAMENTI = new Set([0, 1, 2])

loadEnv()

const baseUrl = (process.env.RCA_BASE_URL || 'https://api.assicurapp.it').replace(/\/$/, '')
const token = process.env.RCA_STATS_TOKEN || ''
const databaseUrl = process.env.DATABASE_URL || ''

const args = parseArgs(process.argv.slice(2))

if (!token) {
  console.error('Manca RCA_STATS_TOKEN nel file .env')
  process.exit(1)
}
if (!databaseUrl) {
  console.error('Manca DATABASE_URL nel file .env')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
})

await client.connect()

try {
  if (args.date) {
    await ingestDate(args.date)
  } else if (args.from) {
    const end = args.to || addDays(romeToday(), -1)
    const dates = range(args.from, end)
    console.log(`Giorni da scaricare: ${dates.length}`)
    for (const date of dates) {
      await ingestDate(date)
      if (args.sleepMs > 0) await sleep(args.sleepMs)
    }
  } else if (args.backfill) {
    await backfill(args)
  } else {
    await ingestDate(addDays(romeToday(), -1))
  }
} finally {
  await client.end()
}

async function backfill(options) {
  let cursor = options.to || addDays(romeToday(), -1)
  let emptyStreak = 0
  let scanned = 0
  let earliestWithData = null
  while (cursor >= options.floor && emptyStreak < options.emptyStreak) {
    const body = await fetchDay(cursor)
    const count = body.data.length
    await saveDay(cursor, body, 200)
    scanned += 1
    if (count > 0) {
      earliestWithData = cursor
      emptyStreak = 0
    } else {
      emptyStreak += 1
    }
    console.log(`${cursor}  preventivi=${count}  vuoti_di_fila=${emptyStreak}`)
    cursor = addDays(cursor, -1)
    if (options.sleepMs > 0 && cursor >= options.floor && emptyStreak < options.emptyStreak) {
      await sleep(options.sleepMs)
    }
  }
  console.log(
    `Ricerca finita. Giorni letti: ${scanned}. Prima data con preventivi: ${earliestWithData || 'nessuna'}.`,
  )
}

async function ingestDate(date) {
  const body = await fetchDay(date)
  await saveDay(date, body, 200)
  const count = Array.isArray(body.data) ? body.data.length : 0
  console.log(`${date}  preventivi=${count}`)
}

async function fetchDay(date) {
  const url = new URL('/api/stats/rca-quotes', baseUrl)
  url.searchParams.set('date', date)
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(60_000),
      })
      const text = await response.text()
      const body = text ? JSON.parse(text) : {}
      if (response.status === 401 || response.status === 403 || response.status === 400) {
        const message = body.message || response.statusText
        throw Object.assign(new Error(`${date} HTTP ${response.status} ${message}`), {
          httpStatus: response.status,
          fatal: true,
        })
      }
      if (!response.ok) {
        throw Object.assign(new Error(`${date} HTTP ${response.status} ${body.message || text}`), {
          httpStatus: response.status,
          fatal: false,
        })
      }
      if (!Array.isArray(body.data)) {
        throw Object.assign(new Error(`${date} risposta senza data[]`), { httpStatus: response.status, fatal: true })
      }
      return body
    } catch (error) {
      if (error.fatal) throw error
      lastError = error
      if (attempt < 3) await sleep(1000 * attempt)
    }
  }
  throw lastError
}

async function saveDay(date, body, httpStatus) {
  await client.query('begin')
  try {
    await client.query('delete from rca_stats.quotes where requested_date = $1', [date])
    const run = await client.query(
      `insert into rca_stats.ingest_runs
         (requested_date, status, http_status, quote_count, started_at, finished_at)
       values ($1, 'success', $2, $3, now(), now())
       returning id`,
      [date, httpStatus, body.data.length],
    )
    const runId = run.rows[0].id
    for (const row of body.data) {
      const quote = normalizeQuote(date, row)
      const inserted = await client.query(
        `insert into rca_stats.quotes
           (ingest_run_id, requested_date, data_preventivo, veicolo, tipo_contraente,
            eta, straniero, provincia, cu, tipologia_rca, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         returning id`,
        [
          runId,
          date,
          quote.data_preventivo,
          quote.veicolo,
          quote.tipo_contraente,
          quote.eta,
          quote.straniero,
          quote.provincia,
          quote.cu,
          quote.tipologia_rca,
          JSON.stringify(row),
        ],
      )
      const quoteId = inserted.rows[0].id
      let posizione = 1
      for (const quotazione of quote.quotazioni) {
        await client.query(
          `insert into rca_stats.quotations
             (quote_id, posizione, compagnia, premio_rca, frazionamento)
           values ($1,$2,$3,$4,$5)`,
          [quoteId, posizione, quotazione.compagnia, quotazione.premio_rca, quotazione.frazionamento],
        )
        posizione += 1
      }
    }
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    await recordError(date, error)
    throw error
  }
}

function normalizeQuote(date, row) {
  if (!VEICOLI.has(row.veicolo)) {
    throw Object.assign(new Error(`${date} veicolo non previsto: ${row.veicolo}`), { fatal: true })
  }
  const tipo = row.tipo_contraente ?? null
  if (tipo !== null && !TIPI.has(tipo)) {
    throw Object.assign(new Error(`${date} tipo_contraente non previsto: ${tipo}`), { fatal: true })
  }
  const quotazioni = Array.isArray(row.quotazioni) ? row.quotazioni : []
  return {
    data_preventivo: row.data_preventivo || null,
    veicolo: row.veicolo,
    tipo_contraente: tipo,
    eta: row.eta === null || row.eta === undefined ? null : Number(row.eta),
    straniero: row.straniero === null || row.straniero === undefined ? null : Boolean(row.straniero),
    provincia: row.provincia || null,
    cu: row.cu === null || row.cu === undefined ? null : String(row.cu),
    tipologia_rca: row.tipologia_rca || null,
    quotazioni: quotazioni.map((item) => {
      const frazionamento = Number(item.frazionamento)
      if (!FRAZIONAMENTI.has(frazionamento)) {
        throw Object.assign(new Error(`${date} frazionamento non previsto: ${item.frazionamento}`), { fatal: true })
      }
      if (!item.compagnia) {
        throw Object.assign(new Error(`${date} quotazione senza compagnia`), { fatal: true })
      }
      return {
        compagnia: String(item.compagnia),
        premio_rca: item.premio_rca,
        frazionamento,
      }
    }),
  }
}

async function recordError(date, error) {
  try {
    await client.query(
      `insert into rca_stats.ingest_runs
         (requested_date, status, http_status, error_message, started_at, finished_at)
       values ($1, 'error', $2, $3, now(), now())`,
      [date, error.httpStatus ?? null, String(error.message || error).slice(0, 2000)],
    )
  } catch (logError) {
    console.error('Impossibile registrare l errore di scarico', logError.message)
  }
}

function parseArgs(argv) {
  const options = {
    date: null,
    from: null,
    to: null,
    backfill: false,
    emptyStreak: 180,
    floor: '2020-01-01',
    sleepMs: 250,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--backfill') options.backfill = true
    else if (arg === '--date') options.date = needIso(argv[++i], arg)
    else if (arg === '--from') options.from = needIso(argv[++i], arg)
    else if (arg === '--to') options.to = needIso(argv[++i], arg)
    else if (arg === '--empty-streak') options.emptyStreak = Number(argv[++i])
    else if (arg === '--floor') options.floor = needIso(argv[++i], arg)
    else if (arg === '--sleep-ms') options.sleepMs = Number(argv[++i])
    else throw new Error(`Argomento sconosciuto: ${arg}`)
  }
  return options
}

function needIso(value, flag) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`${flag} vuole una data YYYY-MM-DD`)
  }
  return value
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

function range(from, to) {
  const dates = []
  let cursor = from
  while (cursor <= to) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

function loadEnv() {
  const path = resolve(process.cwd(), '.env')
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
