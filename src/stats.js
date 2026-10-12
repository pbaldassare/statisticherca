import { query } from './db.js'

const VEICOLI = new Set(['tutti', 'rca_auto', 'rca_moto', 'rca_autocarri'])

export function filtersFromSearch(searchParams) {
  const from = isoOrNull(searchParams.get('from'))
  const to = isoOrNull(searchParams.get('to'))
  const veicolo = VEICOLI.has(searchParams.get('veicolo')) ? searchParams.get('veicolo') : 'tutti'
  return { from, to, veicolo }
}

export async function loadMeta() {
  const rows = await query(`
    select
      min(requested_date)::text as min_date,
      max(requested_date)::text as max_date,
      count(*)::int as preventivi
    from rca_stats.quotes
  `)
  return rows[0] || { min_date: null, max_date: null, preventivi: 0 }
}

export async function loadDashboard({ from, to, veicolo }) {
  const rows = await query(`
    select rca_stats.dashboard('${from}'::date, '${to}'::date, '${veicolo}') as dashboard
  `)
  const value = rows[0]?.dashboard
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function isoOrNull(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null
}
