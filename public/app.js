const pages = [
  { id: 'migliore', label: 'Migliore', icon: 'award', lead: 'La compagnia col prezzo tipico più basso, sui filtri che hai scelto.' },
  { id: 'zone', label: 'Zone', icon: 'map', lead: 'Prezzo medio annuo per provincia e compagnia più conveniente in quella zona.' },
  { id: 'classi', label: 'Classi', icon: 'badge', lead: 'Prezzo medio annuo per classe di merito e chi costa meno in quella classe.' },
  { id: 'persone', label: 'Persone', icon: 'users', lead: 'Prezzo medio annuo e compagnia migliore per tipo di persona e fascia di età.' },
  { id: 'compagnie', label: 'Dove vince', icon: 'building', lead: 'In quali zone una compagnia è la più conveniente.' },
]

const provinceNames = {
  AG: 'Agrigento', AL: 'Alessandria', AN: 'Ancona', AP: 'Ascoli Piceno', AQ: "L'Aquila",
  AR: 'Arezzo', AT: 'Asti', AV: 'Avellino', BA: 'Bari', BG: 'Bergamo', BL: 'Belluno',
  BN: 'Benevento', BO: 'Bologna', BR: 'Brindisi', BS: 'Brescia', BT: 'Barletta-Andria-Trani',
  BZ: 'Bolzano', CA: 'Cagliari', CB: 'Campobasso', CE: 'Caserta', CH: 'Chieti', CL: 'Caltanissetta',
  CN: 'Cuneo', CO: 'Como', CR: 'Cremona', CS: 'Cosenza', CT: 'Catania', CZ: 'Catanzaro',
  EN: 'Enna', FC: 'Forlì-Cesena', FE: 'Ferrara', FG: 'Foggia', FI: 'Firenze', FM: 'Fermo',
  FR: 'Frosinone', GE: 'Genova', GO: 'Gorizia', GR: 'Grosseto', KR: 'Crotone', LC: 'Lecco',
  LE: 'Lecce', LI: 'Livorno', LT: 'Latina', LU: 'Lucca', MB: 'Monza e Brianza', MC: 'Macerata',
  ME: 'Messina', MI: 'Milano', MN: 'Mantova', MO: 'Modena', MS: 'Massa-Carrara', MT: 'Matera',
  NA: 'Napoli', NO: 'Novara', OR: 'Oristano', PA: 'Palermo', PC: 'Piacenza', PD: 'Padova',
  PE: 'Pescara', PG: 'Perugia', PI: 'Pisa', PO: 'Prato', PR: 'Parma', PT: 'Pistoia', PU: 'Pesaro e Urbino',
  PV: 'Pavia', PZ: 'Potenza', RA: 'Ravenna', RC: 'Reggio Calabria', RE: 'Reggio Emilia', RG: 'Ragusa',
  RI: 'Rieti', RM: 'Roma', RN: 'Rimini', RO: 'Rovigo', SA: 'Salerno', SI: 'Siena', SO: 'Sondrio',
  SP: 'La Spezia', SR: 'Siracusa', SS: 'Sassari', SU: 'Sud Sardegna', SV: 'Savona', TA: 'Taranto',
  TE: 'Teramo', TN: 'Trento', TO: 'Torino', TP: 'Trapani', TR: 'Terni', TV: 'Treviso', UD: 'Udine',
  VA: 'Varese', VE: 'Venezia', VI: 'Vicenza', VR: 'Verona', VT: 'Viterbo', VV: 'Vibo Valentia',
  ROMA: 'Roma (testo)', PUG: 'Puglia', 'n.d.': 'Non disponibile',
}

const monthNames = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

const title = document.querySelector('#page-title')
const lead = document.querySelector('#page-lead')
const content = document.querySelector('#content')
const form = document.querySelector('#filters')
const sideNav = document.querySelector('.side-nav')
const bottomNav = document.querySelector('.bottom-nav')
const submitButton = form.querySelector('button')

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
  content.innerHTML = '<p class="status">Caricamento prezzi…</p>'
  form.from.value = '2025-08-01'
  form.to.value = today()
  try {
    await load()
  } catch (error) {
    content.innerHTML = `<section class="empty"><h2>Prezzi non disponibili</h2><p>${escapeHtml(error.message)}</p></section>`
  }
}

async function load() {
  const params = new URLSearchParams(new FormData(form))
  submitButton.disabled = true
  content.innerHTML = '<p class="status">Aggiornamento prezzi…</p>'
  try {
    const response = await fetch(`/api/dashboard?${params}`)
    dashboard = await readJson(response)
    fillOptions()
    applyFilters(dashboard.filters)
    render()
  } catch (error) {
    content.innerHTML = `<section class="empty"><h2>Prezzi non disponibili</h2><p>${escapeHtml(error.message)}</p></section>`
  } finally {
    submitButton.disabled = false
  }
}

function render() {
  const page = pages.some((item) => item.id === location.hash.slice(1))
    ? location.hash.slice(1)
    : 'migliore'
  if (!location.hash) history.replaceState(null, '', '#migliore')
  const current = pages.find((item) => item.id === page)
  title.textContent = current.label
  lead.textContent = current.lead
  for (const button of document.querySelectorAll('[data-page]')) {
    button.classList.toggle('active', button.dataset.page === page)
  }
  if (!dashboard) return
  const views = { migliore, zone, classi, persone, compagnie }
  content.innerHTML = views[page]()
}

function migliore() {
  const data = dashboard.overview
  const winner = data.migliore_compagnia
  const gap = winner && data.media_annua != null && data.migliore_mediana != null
    ? Number(data.media_annua) - Number(data.migliore_mediana)
    : null
  return `
    <section class="answer">
      <p class="eyebrow">${escapeHtml(filterSentence())}</p>
      <h2>${winner ? `La più conveniente è <em>${escapeHtml(winner)}</em>` : 'Nessuna compagnia confrontabile'}</h2>
      <p class="answer-price">${euro(data.migliore_mediana)} <small>l'anno, prezzo tipico</small></p>
      <p>${gap != null && gap > 0 ? `${euro(gap)} in meno del prezzo medio di mercato (${euro(data.media_annua)}).` : `Prezzo medio di mercato ${euro(data.media_annua)}.`}</p>
    </section>
    <section class="grid kpis">
      ${kpi('Prezzo tipico della migliore', euro(data.migliore_mediana), winner || 'Servono più premi confrontabili', 'green')}
      ${kpi('Prezzo medio di mercato', euro(data.media_annua), 'Media di tutti i premi annui del filtro', 'blue')}
      ${kpi('Prezzo tipico di mercato', euro(data.mediana_annua), 'Il valore centrale, meno sensibile ai casi estremi', 'amber')}
    </section>
    <article class="card" style="margin-top:16px">
      <h2>Classifica per prezzo tipico</h2>
      <p class="hint">Barra più corta e verde: costa meno. Il prezzo tipico è la mediana annua. ${escapeHtml(sogliaNote())}</p>
      ${legendPrice()}
      ${companyRows(dashboard.compagnie)}
    </article>
    <article class="card" style="margin-top:16px">
      <h2>Prezzo nel tempo</h2>
      <p class="hint">Linea verde: prezzo tipico annuo. Linea blu: prezzo medio annuo. Premi sotto 60 € l'anno esclusi.</p>
      ${priceTrend(dashboard.mesi)}
    </article>`
}

function zone() {
  const rows = dashboard.zone
  const cheapest = rows.find((row) => row.migliore) || rows[0]
  return `
    <section class="answer">
      <p class="eyebrow">Migliore compagnia per zona</p>
      <h2>${cheapest?.migliore ? `A <em>${escapeHtml(place(cheapest.provincia))}</em> conviene ${escapeHtml(cheapest.migliore)}` : 'Nessuna zona confrontabile'}</h2>
      <p class="answer-price">${euro(cheapest?.media)} <small>l'anno, prezzo medio della zona</small></p>
      <p>${cheapest?.migliore ? `${escapeHtml(cheapest.migliore)} ha un prezzo tipico di ${euro(cheapest.migliore_mediana)}. Se in una zona manca il nome, i premi sono troppo pochi per scegliere una compagnia.` : 'Nessuna zona ha abbastanza premi per indicare una compagnia.'}</p>
    </section>
    <article class="card">
      <h2>Prezzo medio per zona</h2>
      <p class="hint">Persona, età e classe restano quelle dei filtri. La zona scelta è evidenziata, le altre restano visibili per il confronto.</p>
      ${legendPrice()}
      <div class="price-list scroll-list">
        ${priceRows(rows, {
          name: (row) => place(row.provincia),
          price: (row) => Number(row.media),
          extra: (row) => row.migliore ? row.migliore : 'Dati troppo sparsi',
          extraMissing: (row) => !row.migliore,
          selected: (row) => row.provincia === form.provincia.value,
          label: (row) => `${place(row.provincia)}: media ${euro(row.media)}, migliore ${row.migliore || 'n.d.'} ${euro(row.migliore_mediana)}`,
        })}
      </div>
    </article>`
}

function classi() {
  const rows = dashboard.classi
  const selected = form.cu.value !== 'tutte'
    ? rows.find((row) => row.cu === form.cu.value)
    : rows.filter((row) => row.cu !== 'n.d.').reduce((best, row) => (!best || Number(row.media) < Number(best.media) ? row : best), null)
  const headline = !selected
    ? 'Nessuna classe confrontabile'
    : form.cu.value !== 'tutte'
      ? `In <em>${escapeHtml(cuLabel(selected.cu))}</em> conviene ${escapeHtml(selected.migliore || 'nessuna compagnia stabile')}`
      : `La più economica è <em>${escapeHtml(cuLabel(selected.cu))}</em>: conviene ${escapeHtml(selected.migliore || 'nessuna compagnia stabile')}`
  return `
    <section class="answer">
      <p class="eyebrow">Classe di merito</p>
      <h2>${headline}</h2>
      <p class="answer-price">${euro(selected?.media)} <small>l'anno, prezzo medio della classe</small></p>
      <p>${selected?.migliore ? `${escapeHtml(selected.migliore)} ha un prezzo tipico di ${euro(selected.migliore_mediana)}.` : ''}</p>
    </section>
    <article class="card">
      <h2>Prezzo medio per classe</h2>
      <p class="hint">01 e 1 sono la stessa classe. Zona, persona ed età restano quelle dei filtri.</p>
      ${legendPrice()}
      <div class="price-list">
        ${priceRows(rows, {
          name: (row) => cuLabel(row.cu),
          price: (row) => Number(row.media),
          extra: (row) => row.migliore || 'Dati troppo sparsi',
          extraMissing: (row) => !row.migliore,
          selected: (row) => row.cu === form.cu.value,
          label: (row) => `${cuLabel(row.cu)}: media ${euro(row.media)}, migliore ${row.migliore || 'n.d.'}`,
        })}
      </div>
    </article>`
}

function persone() {
  return `
    <section class="grid two">
      <article class="card">
        <h2>Tipo di persona</h2>
        <p class="hint">Il confronto ignora i filtri persona ed età. Restano zona, classe e veicolo.</p>
        ${legendPrice()}
        <div class="price-list">
          ${priceRows(dashboard.persone, {
            name: (row) => personLabel(row.persona),
            price: (row) => Number(row.media),
            extra: (row) => row.migliore || 'Dati troppo sparsi',
            extraMissing: (row) => !row.migliore,
            selected: (row) => row.persona === form.persona.value,
            label: (row) => `${personLabel(row.persona)}: media ${euro(row.media)}, migliore ${row.migliore || 'n.d.'}`,
          })}
        </div>
      </article>
      <article class="card">
        <h2>Età</h2>
        <p class="hint">Prezzo medio annuo e compagnia col prezzo tipico più basso.</p>
        ${legendPrice()}
        <div class="price-list">
          ${priceRows(dashboard.eta, {
            name: (row) => row.fascia === 'n.d.' ? 'Età non disponibile' : row.fascia,
            price: (row) => Number(row.media),
            extra: (row) => row.migliore || 'Dati troppo sparsi',
            extraMissing: (row) => !row.migliore,
            selected: (row) => row.fascia === form.eta.value,
            label: (row) => `${row.fascia}: media ${euro(row.media)}, migliore ${row.migliore || 'n.d.'}`,
          })}
        </div>
      </article>
    </section>`
}

function compagnie() {
  const blocks = dashboard.vittorie.map((row) => `
    <section class="company-block">
      <h3>${escapeHtml(row.compagnia)}</h3>
      <div class="chips">${row.zone.map((code) => `<span class="chip">${escapeHtml(place(code))}</span>`).join('')}</div>
    </section>`).join('')
  return `
    <article class="card">
      <h2>Zone in cui una compagnia è la più conveniente</h2>
      <p class="hint">Per ogni provincia vince chi ha il prezzo tipico annuo più basso. Persona, età e classe sono quelle dei filtri.</p>
      ${blocks || '<p class="empty">Nessuna compagnia ha abbastanza premi per risultare la migliore in una zona.</p>'}
    </article>`
}

function companyRows(rows) {
  if (!rows.length) return emptyPlot('Nessuna compagnia ha abbastanza premi su questi filtri.')
  return `<div class="price-list">${priceRows(rows, {
    name: (row) => row.compagnia,
    price: (row) => Number(row.mediana),
    extra: (row) => row.posto === 1 ? 'Migliore' : `media ${euro(row.media)}`,
    extraMissing: () => false,
    selected: (row) => row.posto === 1,
    best: (row) => row.posto === 1,
    rank: (row) => row.posto,
    label: (row) => `${row.compagnia}: prezzo tipico ${euro(row.mediana)}, media ${euro(row.media)}`,
  })}</div>`
}

function priceRows(rows, fields) {
  if (!rows?.length) return emptyPlot('Nessun prezzo nel periodo.')
  const amounts = rows.map((row) => fields.price(row)).filter((value) => Number.isFinite(value))
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  return rows.map((row) => {
    const amount = fields.price(row)
    const width = !Number.isFinite(amount) || max <= 0 ? 0 : Math.max(6, (amount / max) * 100)
    const color = priceColor(amount, min, max)
    const selected = fields.selected?.(row) ? ' is-selected' : ''
    const best = fields.best?.(row) ? ' is-best' : ''
    const rank = fields.rank ? `<span class="rank" style="background:${fields.best?.(row) ? '#166534' : color}">${fields.rank(row)}</span>` : ''
    const extraClass = fields.extraMissing?.(row) ? ' missing' : ''
    return `<div class="price-row${selected}${best}">
      <span class="price-name">${rank}${escapeHtml(fields.name(row))}</span>
      <span class="track" role="img" aria-label="${escapeHtml(fields.label(row))}"><i style="width:${width.toFixed(1)}%;background:${color}"></i></span>
      <span class="price-euro">${euro(amount)}</span>
      <span class="price-best${extraClass}">${escapeHtml(fields.extra(row))}</span>
    </div>`
  }).join('')
}

function priceTrend(rows) {
  if (!rows?.length) return emptyPlot('Il prezzo nel tempo compare quando ci sono premi nel periodo.')
  const width = 760
  const height = 260
  const pad = { left: 58, right: 16, top: 16, bottom: 36 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const values = rows.flatMap((row) => [Number(row.media), Number(row.mediana)]).filter(Number.isFinite)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (index) => pad.left + (rows.length === 1 ? innerW / 2 : (innerW * index) / (rows.length - 1))
  const y = (value) => pad.top + innerH - ((value - min) / span) * innerH
  const line = (key) => rows
    .map((row, index) => ({ index, value: Number(row[key]) }))
    .filter((point) => Number.isFinite(point.value))
    .map((point, index) => `${index ? 'L' : 'M'}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ')
  const area = `${line('mediana')} L${x(rows.length - 1).toFixed(1)},${pad.top + innerH} L${x(0).toFixed(1)},${pad.top + innerH} Z`
  const ticks = tickIndexes(rows.length, 6)
  const grid = [0, 0.5, 1].map((step) => {
    const yLine = pad.top + innerH - step * innerH
    const value = min + span * step
    return `<line x1="${pad.left}" y1="${yLine}" x2="${width - pad.right}" y2="${yLine}" stroke="#e0f2fe"/>
      <text x="${pad.left - 8}" y="${yLine + 4}" text-anchor="end" class="axis">${escapeHtml(euro(value))}</text>`
  }).join('')
  const labels = ticks.map((index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" class="axis">${escapeHtml(formatMonth(rows[index].mese))}</text>`).join('')
  return `<figure class="plot">
    <div class="legend"><span><i class="swatch" style="background:#166534"></i>Prezzo tipico</span><span><i class="swatch" style="background:#0369a1"></i>Prezzo medio</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Andamento del prezzo annuo">
      ${grid}
      <path d="${area}" fill="rgb(22 163 74 / 0.15)"></path>
      <path d="${line('media')}" fill="none" stroke="#0369a1" stroke-width="2.5" stroke-linejoin="round"></path>
      <path d="${line('mediana')}" fill="none" stroke="#166534" stroke-width="2.5" stroke-linejoin="round"></path>
      ${labels}
    </svg>
  </figure>`
}

function legendPrice() {
  return `<div class="legend"><span><i class="swatch" style="background:#166534"></i>Più basso</span><span><i class="swatch" style="background:#0369a1"></i>Intermedio</span><span><i class="swatch" style="background:#c2410c"></i>Più alto</span></div>`
}

function applyFilters(filters) {
  form.from.value = filters.from
  form.to.value = filters.to
  form.veicolo.value = filters.veicolo
  form.persona.value = filters.persona
  form.eta.value = filters.eta
  form.cu.value = filters.cu
  form.provincia.value = filters.provincia
}

function fillOptions() {
  const filters = dashboard.filters
  fillSelect(form.cu, dashboard.opzioni.cu, cuLabel, filters.cu, 'tutte', 'Tutte')
  fillSelect(
    form.provincia,
    [...dashboard.opzioni.province].sort((a, b) => place(a).localeCompare(place(b), 'it')),
    place,
    filters.provincia,
    'tutte',
    'Tutte',
  )
}

function fillSelect(select, values, name, current, allValue, allLabel) {
  select.innerHTML = [
    `<option value="${allValue}">${allLabel}</option>`,
    ...values.filter((value) => value !== allValue).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(name(value))}</option>`),
  ].join('')
  select.value = [...select.options].some((option) => option.value === current) ? current : allValue
}

function filterSentence() {
  const filters = dashboard.filters
  const vehicles = { rca_auto: 'Auto', rca_moto: 'Moto', rca_autocarri: 'Autocarri', rca_ciclomotori: 'Ciclomotori' }
  const bits = []
  if (filters.veicolo !== 'tutti') bits.push(vehicles[filters.veicolo] || filters.veicolo)
  if (filters.persona !== 'tutti') bits.push(personLabel(filters.persona))
  if (filters.eta !== 'tutte') bits.push(`età ${filters.eta}`)
  if (filters.cu !== 'tutte') bits.push(cuLabel(filters.cu))
  if (filters.provincia !== 'tutte') bits.push(place(filters.provincia))
  return bits.length ? bits.join(' · ') : 'Tutti i veicoli, le persone, le classi e le zone'
}

function sogliaNote() {
  const soglia = dashboard.overview?.soglia
  if (soglia === 3) return 'Su questo filtro i premi sono pochi: entrano le compagnie con almeno 3 prezzi.'
  return 'Entrano le compagnie con almeno 8 prezzi annui, così un caso isolato non vince la classifica.'
}

function kpi(labelText, value, note, tone) {
  return `<article class="card kpi ${tone}"><span class="kpi-label">${labelText}</span><span class="kpi-value">${value}</span><p class="kpi-note">${note}</p></article>`
}

function navButton(page) {
  return `<button class="nav-btn" type="button" data-page="${page.id}">${icon(page.icon)}<span>${page.label}</span></button>`
}

function icon(name) {
  const paths = {
    award: '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 8H6a2 2 0 0 0 0 4h1.2M16 8h2a2 2 0 0 1 0 4h-1.2"/><path d="m9 14-1 6 4-2 4 2-1-6"/>',
    building: '<path d="M4 20h16M6 20V6h8v14M14 10h4v10M9 9h2M9 13h2M9 17h2"/>',
    map: '<path d="M9 18 4 20V6l5-2 6 2 5-2v14l-5 2-6-2zM9 4v14M15 6v14"/>',
    users: '<path d="M16 19v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19v-1a3 3 0 0 0-2.2-2.9M16 6.1a3 3 0 0 1 0 5.8"/>',
    badge: '<path d="M12 3 9.5 5H6v3.5L4 11l2 2.5V17h3.5L12 19l2.5-2H18v-3.5L20 11l-2-2.5V5h-3.5z"/><path d="m9 11 2 2 4-4"/>',
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

function place(code) {
  return provinceNames[code] || String(code)
}

function cuLabel(value) {
  if (value === 'n.d.') return 'Classe non disponibile'
  if (/^\d+$/.test(value)) return `Classe ${Number(value)}`
  return `Classe ${value}`
}

function personLabel(value) {
  if (value === 'privato') return 'Privato'
  if (value === 'azienda') return 'Azienda'
  return 'Non disponibile'
}

function priceColor(value, min, max) {
  if (!Number.isFinite(value)) return '#94a3b8'
  const t = max === min ? 0 : (value - min) / (max - min)
  if (t < 0.5) return mix(t * 2, [22, 101, 52], [3, 105, 161])
  return mix((t - 0.5) * 2, [3, 105, 161], [194, 65, 12])
}

function mix(amount, from, to) {
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * amount)
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`
}

function tickIndexes(length, count) {
  if (length <= count) return [...Array(length).keys()]
  return [...Array(count).keys()].map((index) => Math.round((index * (length - 1)) / (count - 1)))
}

function euro(value) {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—'
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(value))
}

function formatMonth(value) {
  const [year, month] = String(value).split('-')
  return `${monthNames[Number(month) - 1] || month} ${year}`
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function emptyPlot(message) {
  return `<div class="empty-plot">${escapeHtml(message)}</div>`
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}

async function readJson(response) {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Errore di lettura')
  return body
}
