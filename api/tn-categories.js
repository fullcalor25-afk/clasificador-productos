import { logRequest, supabaseQuery } from './_helpers.js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  logRequest('tn-categories', { method: req.method, query: req.query, body: req.body })

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  const { id } = req.query

  // GET — devuelve todas las categorías TN ordenadas
  if (req.method === 'GET') {
    try {
      const data = await supabaseQuery(
        '/rest/v1/tiendanube_categories?select=*&activa=eq.true&order=nivel1.asc,nivel2.asc,nivel3.asc,orden.asc',
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      return res.status(200).json(data || [])
    } catch (e) {
      console.error('[tn-categories GET]', e.message)
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // POST — crear fila
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request inválido' })

    const nivel1   = (body.nivel1 || body.level1 || '').trim()
    const nivel2   = body.nivel2  || body.level2  || null
    const nivel3   = body.nivel3  || body.level3  || null
    const nivel4   = body.nivel4  || body.level4  || null
    const keywords = body.keywords || body.keyword || null
    const orden    = body.orden    || body.order   || 0

    if (!nivel1) return res.status(400).json({ error: 'Se requiere al menos nivel1' })

    // Máximo 4 niveles
    const levelCount = [nivel1, nivel2, nivel3, nivel4].filter(Boolean).length
    if (levelCount > 4)
      return res.status(400).json({ error: 'Máximo 4 niveles de jerarquía permitidos' })

    const payload = {
      nivel1,
      nivel2,
      nivel3,
      nivel4,
      keywords,
      activa: body.activa !== undefined ? body.activa : true,
      orden,
    }

    try {
      const data = await supabaseQuery(
        '/rest/v1/tiendanube_categories',
        { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) },
        SUPABASE_URL, SUPABASE_KEY
      )
      return res.status(200).json(Array.isArray(data) ? data[0] : (data || {}))
    } catch (e) {
      console.error('[tn-categories POST]', e.message)
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // PUT — actualizar fila
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Falta id' })
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request inválido' })

    const allowed = ['nivel1', 'nivel2', 'nivel3', 'nivel4', 'keywords', 'activa', 'orden']
    const patch = {}
    allowed.forEach(k => { if (body[k] !== undefined) patch[k] = body[k] })

    if (Object.keys(patch).length === 0)
      return res.status(400).json({ error: 'No hay campos para actualizar' })

    try {
      await supabaseQuery(
        '/rest/v1/tiendanube_categories?id=eq.' + id,
        { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) },
        SUPABASE_URL, SUPABASE_KEY
      )
      return res.status(200).json({ success: true })
    } catch (e) {
      console.error('[tn-categories PUT]', e.message)
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // DELETE — eliminar fila
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Falta id' })
    try {
      await supabaseQuery(
        '/rest/v1/tiendanube_categories?id=eq.' + id,
        { method: 'DELETE', headers: { Prefer: 'return=minimal' } },
        SUPABASE_URL, SUPABASE_KEY
      )
      return res.status(200).json({ success: true })
    } catch (e) {
      console.error('[tn-categories DELETE]', e.message)
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
