import { handleApi } from '../../src/handle-api.js'

export async function onRequest(context) {
  try {
    return await handleApi(context.request, context.env)
  } catch (error) {
    console.error(error)
    return Response.json({ error: 'Impossibile leggere le statistiche' }, { status: 500 })
  }
}
