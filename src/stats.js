import { query } from './db.js'

const VEICOLI = new Set(['tutti', 'rca_auto', 'rca_moto', 'rca_autocarri'])
const PERSONE = new Set(['tutti', 'privato', 'azienda', 'n.d.'])
const ETA = new Set(['tutte', '18-25', '26-35', '36-45', '46-55', '56-65', '66+', 'n.d.'])

export function filtersFromSearch(searchParams) {
  return {
    from: isoOrNull(searchParams.get('from')),
    to: isoOrNull(searchParams.get('to')),
    veicolo: VEICOLI.has(searchParams.get('veicolo')) ? searchParams.get('veicolo') : 'tutti',
    persona: PERSONE.has(searchParams.get('persona')) ? searchParams.get('persona') : 'tutti',
    eta: ETA.has(searchParams.get('eta')) ? searchParams.get('eta') : 'tutte',
    cu: normalizeCu(searchParams.get('cu')),
    provincia: normalizeProvincia(searchParams.get('provincia')),
  }
}

export async function loadMeta() {
  const rows = await query(`
    select
      min(requested_date)::text as min_date,
      max(requested_date)::text as max_date
    from rca_stats.quotes
  `)
  return rows[0] || { min_date: null, max_date: null }
}

export async function loadDashboard(filters) {
  const { from, to, veicolo, persona, eta, cu, provincia } = filters
  const rows = await query(`
    select rca_stats.dashboard(
      '${from}'::date,
      '${to}'::date,
      '${veicolo}',
      '${persona}',
      '${eta}',
      '${cu}',
      '${provincia}'
    ) as dashboard
  `)
  const value = rows[0]?.dashboard
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function isoOrNull(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : null
}

function normalizeCu(value) {
  if (!value || value === 'tutte') return 'tutte'
  if (value === 'n.d.') return 'n.d.'
  if (/^\d+$/.test(value)) return String(Number(value)).padStart(2, '0')
  return 'tutte'
}

function normalizeProvincia(value) {
  if (!value || value === 'tutte') return 'tutte'
  const text = value.trim()
  if (text === 'n.d.') return text
  if (/^[A-Za-z0-9]{2,5}$/.test(text)) return text.toUpperCase()
  return 'tutte'
}
