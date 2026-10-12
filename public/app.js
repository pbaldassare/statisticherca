const pages = [
  { id: 'panoramica', label: 'Panoramica', icon: 'home' },
  { id: 'compagnie', label: 'Compagnie', icon: 'building' },
  { id: 'territorio', label: 'Territorio', icon: 'map' },
  { id: 'profili', label: 'Profili', icon: 'users' },
  { id: 'andamento', label: 'Andamento', icon: 'chart' },
]

const labels = {
  rca_auto: 'Auto',
  rca_moto: 'Moto',
  rca_autocarri: 'Autocarri',
  privato: 'Privato',
  azienda: 'Azienda',
  'n.d.': 'Non disponibile',
  continuita_assicurativa: 'Continuità assicurativa',
  bersani: 'Bersani',
  bersani_familiare: 'Bersani familiare',
  bersani_stesso_proprietario: 'Bersani stesso proprietario',
  cu14: 'CU 14',
  recupero_atr: 'Recupero ATR',
}

const title = document.querySelector('#page-title')
const content = document.querySelector('#content')
const form = document.querySelector('#filters')
const sideNav = document.querySelector('.side-nav')
const bottomNav = document.querySelector('.bottom-nav')

let dashboard = null

sideNav.innerHTML = pages.map(navButton).join('')
bottomNav.innerHTML = pages.map(navButton).join('')
document.body.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]')
  if (!button) return
  location.hash = button.dataset.page
})
window.addEventListener('hashchange', render)
form.addEventListener('submit', async (event) => {
  event.preventDefault()
  await load()
})

boot()

async function boot() {
  content.innerHTML = '<p class="status">Caricamento statistiche…</p>'
  try {
    form.from.value = '2020-01-01'
    form.to.value = today()
    await load()
    if (dashboard.days?.length) {
      form.from.value = String(dashboard.days[0].giorno).slice(0, 10)
      form.to.value = String(dashboard.days.at(-1).giorno).slice(0, 10)
    }
  } catch (error) {
    content.innerHTML = `<section class="empty"><h2>Statistiche non disponibili</h2><p>${escapeHtml(error.message)}</p></section>`
  }
}

async function load() {
  const params = new URLSearchParams(new FormData(form))
  content.innerHTML = '<p class="status">Aggiornamento…</p>'
  const response = await fetch(`/api/dashboard?${params}`)
  dashboard = await readJson(response)
  form.from.value = dashboard.filters.from
  form.to.value = dashboard.filters.to
  form.veicolo.value = dashboard.filters.veicolo
  render()
}

function render() {
  const page = pages.some((item) => item.id === location.hash.slice(1))
    ? location.hash.slice(1)
    : 'panoramica'
  if (!location.hash) history.replaceState(null, '', '#panoramica')
  title.textContent = pages.find((item) => item.id === page).label
  for (const button of document.querySelectorAll('[data-page]')) {
    button.classList.toggle('active', button.dataset.page === page)
  }
  if (!dashboard) return
  const views = { panoramica, compagnie, territorio, profili, andamento }
  content.innerHTML = views[page]()
}

function panoramica() {
  const data = dashboard.overview
  return `
    <section class="grid kpis">
      ${kpi('Preventivi', formatNumber(data.preventivi), 'Nel periodo selezionato')}
      ${kpi('Con quotazione', formatNumber(data.con_premio), `${formatNumber(data.senza_premio)} senza premio`)}
      ${kpi('Premio annuo mediano', euro(data.mediana_annuale), 'Miglior premio annuale del preventivo')}
      ${kpi('Compagnie', formatNumber(data.compagnie), `Minimo annuo ${euro(data.minimo_annuale)}`)}
    </section>
    <article class="card chart-card">
      <h2>Trend del periodo</h2>
      <p class="hint">Preventivi al giorno e mediana del miglior premio annuale.</p>
      ${trendChart(dashboard.days)}
    </article>
    <section class="grid two">
      <article class="card">
        <h2>Mix veicoli</h2>
        <p class="hint">Preventivi per tipo di veicolo.</p>
        ${donutChart(dashboard.vehicles.map((row) => ({ name: label(row.veicolo), value: row.preventivi })))}
      </article>
      <article class="card">
        <h2>Contraente</h2>
        <p class="hint">Privati, aziende e codici fiscali non letti.</p>
        ${donutChart(dashboard.contraenti.map((row) => ({ name: label(row.tipo), value: row.preventivi })))}
      </article>
    </section>`
}

function compagnie() {
  const rows = dashboard.companies.map((row) => `
    <tr>
      <td>${escapeHtml(row.compagnia)}</td>
      <td class="num">${formatNumber(row.quotazioni)}</td>
      <td class="num">${euro(row.minimo)}</td>
      <td class="num">${euro(row.mediana)}</td>
      <td class="num">${euro(row.massimo)}</td>
    </tr>`).join('')
  return `
    <article class="card">
      <h2>Premio RCA annuale per compagnia</h2>
      <p class="hint">Solo frazionamento annuale. Il semestrale è il premio del semestre e non è confrontabile.</p>
      ${columnChart(dashboard.companies, (row) => row.compagnia, (row) => Number(row.mediana) || 0, euro)}
    </article>
    <article class="card" style="margin-top:16px">
      <table>
        <thead><tr><th>Compagnia</th><th class="num">Quotazioni</th><th class="num">Minimo</th><th class="num">Mediana</th><th class="num">Massimo</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </article>`
}

function territorio() {
  const top = dashboard.provinces.slice(0, 12)
  return `
    <article class="card">
      <h2>Provincia di residenza</h2>
      <p class="hint">Le dodici province con più preventivi. L'etichetta include la mediana del premio annuale.</p>
      ${columnChart(top, (row) => `${row.provincia} ${euro(row.mediana)}`, (row) => row.preventivi, formatNumber)}
    </article>`
}

function profili() {
  const stranieri = dashboard.stranieri
  return `
    <section class="grid two">
      <article class="card">
        <h2>Età</h2>
        <p class="hint">Ricavata dal codice fiscale. Vuota per le aziende.</p>
        ${columnChart(dashboard.eta, (row) => row.fascia, (row) => row.preventivi, formatNumber)}
      </article>
      <article class="card">
        <h2>Classe CU</h2>
        <p class="hint">Mediana del miglior premio annuale.</p>
        ${columnChart(dashboard.cu, (row) => `CU ${row.cu}`, (row) => row.preventivi, formatNumber)}
      </article>
    </section>
    <section class="grid two">
      <article class="card">
        <h2>Tipologia RCA</h2>
        <p class="hint">Come è stata costruita la classe di merito.</p>
        ${columnChart(dashboard.tipologie, (row) => label(row.tipologia), (row) => row.preventivi, formatNumber)}
      </article>
      <article class="card">
        <h2>Nascita</h2>
        <p class="hint">Dal codice fiscale. Non disponibile per le aziende.</p>
        ${donutChart([
          { name: 'Italia', value: stranieri.no },
          { name: 'Estero', value: stranieri.si },
          { name: 'Non disponibile', value: stranieri.nd },
        ])}
      </article>
    </section>`
}

function andamento() {
  return `
    <article class="card">
      <h2>Andamento giornaliero</h2>
      <p class="hint">Area: numero di preventivi. Linea: mediana del miglior premio annuale.</p>
      ${trendChart(dashboard.days)}
    </article>
    <article class="card chart-card">
      <h2>Preventivi con quotazione</h2>
      <p class="hint">Quanti preventivi del giorno hanno almeno un premio.</p>
      ${columnChart(dashboard.days, (row) => formatDay(row.giorno), (row) => row.con_premio, formatNumber)}
    </article>`
}

function trendChart(rows) {
  if (!rows.length) return emptyPlot('Il trend compare dopo il primo scarico.')
  const width = 760
  const height = 280
  const pad = { left: 46, right: 58, top: 16, bottom: 36 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const maxVolume = Math.max(...rows.map((row) => Number(row.preventivi) || 0), 1)
  const premiums = rows.map((row) => Number(row.mediana)).filter((value) => Number.isFinite(value))
  const maxPremium = Math.max(...premiums, 1)
  const minPremium = premiums.length ? Math.min(...premiums) : 0
  const x = (index) => pad.left + (rows.length === 1 ? innerW / 2 : (innerW * index) / (rows.length - 1))
  const yVolume = (value) => pad.top + innerH - (value / maxVolume) * innerH
  const yPremium = (value) => {
    const span = maxPremium - minPremium || 1
    return pad.top + innerH - ((value - minPremium) / span) * innerH
  }
  const volumeLine = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${yVolume(Number(row.preventivi) || 0).toFixed(1)}`).join(' ')
  const area = `${volumeLine} L${x(rows.length - 1).toFixed(1)},${pad.top + innerH} L${x(0).toFixed(1)},${pad.top + innerH} Z`
  const premiumLine = rows
    .map((row, index) => ({ index, value: Number(row.mediana) }))
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.index).toFixed(1)},${yPremium(point.value).toFixed(1)}`)
    .join(' ')
  const ticks = tickIndexes(rows.length, 6)
  const grid = [0, 0.5, 1].map((step) => {
    const y = pad.top + innerH - step * innerH
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="hsl(220 10% 92%)"/>
      <text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" class="axis">${formatNumber(Math.round(maxVolume * step))}</text>`
  }).join('')
  const labels = ticks.map((index) => `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" class="axis">${escapeHtml(formatDay(rows[index].giorno))}</text>`).join('')
  const dots = rows.map((row, index) => `<circle cx="${x(index)}" cy="${yVolume(Number(row.preventivi) || 0)}" r="3.5" fill="hsl(232 100% 10%)"><title>${escapeHtml(formatDay(row.giorno))}: ${formatNumber(row.preventivi)} preventivi</title></circle>`).join('')
  return `<figure class="plot">
    <div class="legend"><span><i class="swatch volume"></i>Preventivi</span><span><i class="swatch premium"></i>Premio mediano</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend giornaliero dei preventivi e del premio mediano">
      ${grid}
      <path d="${area}" fill="hsl(232 100% 10% / 0.12)"></path>
      <path d="${volumeLine}" fill="none" stroke="hsl(232 100% 10%)" stroke-width="2.5" stroke-linejoin="round"></path>
      <path d="${premiumLine}" fill="none" stroke="hsl(200 85% 42%)" stroke-width="2.5" stroke-linejoin="round"></path>
      ${dots}
      ${labels}
      <text x="${width - 6}" y="${yPremium(maxPremium) + 4}" text-anchor="end" class="axis">${escapeHtml(euro(maxPremium))}</text>
      <text x="${width - 6}" y="${Math.min(pad.top + innerH, yPremium(minPremium) + 4)}" text-anchor="end" class="axis">${escapeHtml(euro(minPremium))}</text>
    </svg>
  </figure>`
}

function columnChart(rows, name, value, format) {
  if (!rows.length) return emptyPlot('Nessun dato nel periodo.')
  const width = 760
  const height = 280
  const pad = { left: 44, right: 12, top: 22, bottom: 78 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const max = Math.max(...rows.map((row) => Number(value(row)) || 0), 1)
  const gap = 10
  const barW = Math.max(8, innerW / rows.length - gap)
  const labelEvery = Math.ceil(rows.length / 8)
  const bars = rows.map((row, index) => {
    const amount = Number(value(row)) || 0
    const h = (amount / max) * innerH
    const x = pad.left + index * (innerW / rows.length) + gap / 2
    const y = pad.top + innerH - h
    const labelX = (x + barW / 2).toFixed(1)
    const label = index % labelEvery === 0
      ? `<text x="${labelX}" y="${height - 12}" text-anchor="end" class="axis" transform="rotate(-40 ${labelX} ${height - 12})">${escapeHtml(name(row))}</text>`
      : ''
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, amount ? 2 : 0).toFixed(1)}" rx="6" fill="hsl(232 100% 10%)"><title>${escapeHtml(name(row))}: ${escapeHtml(format(amount))}</title></rect>${label}`
  }).join('')
  return `<figure class="plot"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Diagramma a colonne">${bars}
    <text x="${pad.left - 8}" y="${pad.top + 4}" text-anchor="end" class="axis">${escapeHtml(format(max))}</text>
    <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" stroke="hsl(220 10% 92%)"/>
  </svg></figure>`
}

function donutChart(slices) {
  const total = slices.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0)
  if (!total) return emptyPlot('Nessun dato nel periodo.')
  const colors = ['hsl(232 100% 10%)', 'hsl(200 85% 42%)', 'hsl(158 60% 42%)', 'hsl(38 92% 50%)', 'hsl(232 40% 55%)']
  const radius = 64
  const circumference = 2 * Math.PI * radius
  let offset = 0
  const rings = slices.map((slice, index) => {
    const length = ((Number(slice.value) || 0) / total) * circumference
    const ring = `<circle cx="90" cy="90" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="22" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"><title>${escapeHtml(slice.name)}: ${formatNumber(slice.value)}</title></circle>`
    offset += length
    return ring
  }).join('')
  const legend = slices.map((slice, index) => `<li><i class="swatch" style="background:${colors[index % colors.length]}"></i>${escapeHtml(slice.name)} <strong>${formatNumber(slice.value)}</strong></li>`).join('')
  return `<div class="donut-layout"><svg viewBox="0 0 180 180" role="img" aria-label="Diagramma a ciambella">${rings}<text x="90" y="86" text-anchor="middle" class="donut-total">${formatNumber(total)}</text><text x="90" y="106" text-anchor="middle" class="axis">totale</text></svg><ul class="legend-list">${legend}</ul></div>`
}

function emptyPlot(message) {
  return `<div class="empty-plot">${escapeHtml(message)}</div>`
}

function tickIndexes(length, count) {
  if (length <= count) return [...Array(length).keys()]
  return [...Array(count).keys()].map((index) => Math.round((index * (length - 1)) / (count - 1)))
}

function kpi(labelText, value, note) {
  return `<article class="card"><span class="kpi-label">${labelText}</span><span class="kpi-value">${value}</span><p class="kpi-note">${note}</p></article>`
}

function navButton(page) {
  return `<button class="nav-btn" type="button" data-page="${page.id}">${icon(page.icon)}<span>${page.label}</span></button>`
}

function icon(name) {
  const paths = {
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
    building: '<path d="M4 20h16M6 20V6h8v14M14 10h4v10M9 9h2M9 13h2M9 17h2"/>',
    map: '<path d="M9 18 4 20V6l5-2 6 2 5-2v14l-5 2-6-2zM9 4v14M15 6v14"/>',
    users: '<path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a3 3 0 0 0-2.2-2.9M16 6.1a3 3 0 0 1 0 5.8"/>',
    chart: '<path d="M4 19h16M7 16v-5M12 16V8M17 16v-3"/>',
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

function label(value) {
  return labels[value] || String(value || 'Non disponibile').replaceAll('_', ' ')
}
function formatNumber(value) {
  return new Intl.NumberFormat('it-IT').format(Number(value) || 0)
}
function euro(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value))
}
function formatDay(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}
function today() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
async function readJson(response) {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Errore di lettura')
  return body
}
