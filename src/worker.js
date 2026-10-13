import { loadDashboard, loadMeta, resolveFilters } from './stats.js'

export default {
  async fetch(request, env) {
    if (env.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request)
    }
    try {
      if (url.pathname === '/api/meta') {
        return Response.json(await loadMeta())
      }
      if (url.pathname === '/api/dashboard') {
        const filters = await resolveFilters(url.searchParams)
        const dashboard = await loadDashboard(filters)
        return Response.json({ filters, ...dashboard })
      }
      return Response.json({ error: 'Percorso non trovato' }, { status: 404 })
    } catch (error) {
      console.error(error)
      return Response.json({ error: 'Impossibile leggere le statistiche' }, { status: 500 })
    }
  },
}
