import { query } from './db.js'

const VEICOLI = new Set(['rca_auto', 'rca_moto', 'rca_autocarri', 'rca_ciclomotori'])
const TIPI = new Set(['privato', 'azienda'])

export async function runLoad({ baseUrl, token, args }) {
  const end = args.to || args.date || addDays(romeToday(), -1)
  const start = args.from || (args.backfill ? '2025-07-16' : end)
  const dates = args.date ? [args.date] : range(start, end)
  console.log(`Giorni da scaricare: ${dates.length}`)
  let batch = []
  let quotesInBatch = 0
  for (const date of dates) {
    const body = await fetchDay(baseUrl, token, date)
    batch.push({ date, rows: body.data })
    quotesInBatch += body.data.length
    console.log(`${date}  preventivi=${body.data.length}`)
    if (batch.length >= 21 || quotesInBatch >= 2500) {
      await saveBatch(batch)
      batch = []
      quotesInBatch = 0
    }
    if (args.sleepMs > 0) await sleep(args.sleepMs)
  }
  if (batch.length) await saveBatch(batch)
  console.log('Scarico completato')
}

async function saveBatch(days) {
  const dates = days.map((day) => day.date)
  const records = []
  for (const day of days) {
    day.rows.forEach((row, index) => {
      const quote = normalizeQuote(day.date, row)
      records.push({
        ordinal: records.length + 1,
        requested_date: day.date,
        data_preventivo: quote.data_preventivo,
        veicolo: quote.veicolo,
        tipo_contraente: quote.tipo_contraente,
        eta: quote.eta,
        straniero: quote.straniero,
        provincia: quote.provincia,
        cu: quote.cu,
        tipologia_rca: quote.tipologia_rca,
        source: { ...row, _ordinal: records.length + 1 },
        quotazioni: quote.quotazioni.map((item, posizione) => ({
          posizione: posizione + 1,
          compagnia: item.compagnia,
          premio_rca: item.premio_rca,
          frazionamento: item.frazionamento,
        })),
      })
      if (records.at(-1).source._ordinal !== records.length) {
        records.at(-1).source._ordinal = records.length
      }
    })
  }
  const dateList = dates.map((date) => `'${date}'`).join(',')
  const tag = `$rca${Date.now().toString(16)}$`
  const payload = records.length ? `${tag}${JSON.stringify(records)}${tag}` : null
  await query(`delete from rca_stats.quotes where requested_date in (${dateList});`)
  const sql = records.length
    ? `
with payload as (
  select * from jsonb_to_recordset(${payload}::jsonb) as x(
    ordinal int,
    requested_date text,
    data_preventivo text,
    veicolo text,
    tipo_contraente text,
    eta int,
    straniero boolean,
    provincia text,
    cu text,
    tipologia_rca text,
    source jsonb,
    quotazioni jsonb
  )
),
runs as (
  insert into rca_stats.ingest_runs
    (requested_date, status, http_status, quote_count, started_at, finished_at)
  select d.requested_date, 'success', 200, count(p.ordinal)::int, now(), now()
  from unnest(array[${dateList}]::date[]) as d(requested_date)
  left join payload p on p.requested_date::date = d.requested_date
  group by d.requested_date
  returning id, requested_date
),
inserted as (
  insert into rca_stats.quotes
    (ingest_run_id, requested_date, data_preventivo, veicolo, tipo_contraente,
     eta, straniero, provincia, cu, tipologia_rca, source)
  select
    r.id,
    p.requested_date::date,
    nullif(p.data_preventivo, '')::timestamp,
    p.veicolo,
    p.tipo_contraente,
    p.eta,
    p.straniero,
    nullif(p.provincia, ''),
    nullif(p.cu, ''),
    nullif(p.tipologia_rca, ''),
    p.source
  from payload p
  join runs r on r.requested_date = p.requested_date::date
  returning id, (source->>'_ordinal')::int as ordinal
)
insert into rca_stats.quotations (quote_id, posizione, compagnia, premio_rca, frazionamento)
select
  i.id,
  (item->>'posizione')::smallint,
  item->>'compagnia',
  (item->>'premio_rca')::numeric,
  (item->>'frazionamento')::smallint
from inserted i
join payload p on (p.source->>'_ordinal')::int = i.ordinal
cross join lateral jsonb_array_elements(p.quotazioni) as item;
`
    : `
insert into rca_stats.ingest_runs
  (requested_date, status, http_status, quote_count, started_at, finished_at)
select d.requested_date, 'success', 200, 0, now(), now()
from unnest(array[${dateList}]::date[]) as d(requested_date);
`
  await query(sql)
  console.log(`salvati ${dates[0]} → ${dates.at(-1)}  preventivi=${records.length}`)
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
    quotazioni: quotazioni.flatMap((item) => {
      const frazionamento = Number(item.frazionamento)
      if (!Number.isInteger(frazionamento) || frazionamento < 0 || frazionamento > 2) return []
      if (!item.compagnia) {
        throw Object.assign(new Error(`${date} quotazione senza compagnia`), { fatal: true })
      }
      return [{
        compagnia: String(item.compagnia),
        premio_rca: item.premio_rca,
        frazionamento,
      }]
    }),
  }
}

async function fetchDay(baseUrl, token, date) {
  const url = new URL('/api/stats/rca-quotes', baseUrl)
  url.searchParams.set('date', date)
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      })
      const body = await response.json()
      if (response.status === 401 || response.status === 403 || response.status === 400) {
        throw Object.assign(new Error(`${date} HTTP ${response.status} ${body.message || response.statusText}`), { fatal: true })
      }
      if (!response.ok || !Array.isArray(body.data)) {
        throw Object.assign(new Error(`${date} HTTP ${response.status} ${body.message || 'risposta non valida'}`), { fatal: false })
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
