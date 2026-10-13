import { queryPg } from './pg-query.js'
import { loadDashboard, loadMeta, resolveFilters } from './stats.js'

export async function handleApi(request, env) {
  if (env?.DATABASE_URL) process.env.DATABASE_URL = env.DATABASE_URL
  const url = new URL(request.url)
  if (url.pathname === '/api/meta') {
    return Response.json(await loadMeta(queryPg))
  }
  if (url.pathname === '/api/dashboard') {
    const filters = await resolveFilters(url.searchParams, queryPg)
    const dashboard = await loadDashboard(filters, queryPg)
    return Response.json({ filters, ...dashboard })
  }
  return Response.json({ error: 'Percorso non trovato' }, { status: 404 })
}
