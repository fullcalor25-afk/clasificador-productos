import { logRequest } from './_helpers.js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  logRequest('rules', { method: req.method, query: req.query, body: req.body })

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Supabase no está configurado' })

  const h = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
  }

  const { id } = req.query

  // GET: Fetch rules
  if (req.method === 'GET') {
    try {
      const r    = await fetch(SUPABASE_URL + '/rest/v1/classification_rules?select=*&order=id.asc', { headers: h })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // POST: Crear regla o seed masivo
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request inválido' })

    // Seed / reset
    if (body.reset === true && Array.isArray(body.defaults)) {
      try {
        await fetch(SUPABASE_URL + '/rest/v1/classification_rules?id=gt.0', {
          method: 'DELETE',
          headers: h,
        })
        const batchSize = 50
        for (let i = 0; i < body.defaults.length; i += batchSize) {
          const chunk = body.defaults.slice(i, i + batchSize).map(r => ({
            tipo:   r.tipo,
            nivel:  r.nivel,
            valor:  r.valor,
            peso:   r.peso,
            activa: r.activa !== undefined ? r.activa : true,
          }))
          await fetch(SUPABASE_URL + '/rest/v1/classification_rules', {
            method: 'POST',
            headers: { ...h, Prefer: 'return=minimal' },
            body: JSON.stringify(chunk),
          })
        }
        return res.status(200).json({ success: true, seeded: body.defaults.length })
      } catch (e) {
        return res.status(500).json({ error: e.message })
      }
    }

    // Regla individual
    const { tipo, nivel, valor, peso, activa } = body
    if (!tipo || !nivel || !valor)
      return res.status(400).json({ error: 'Faltan campos requeridos' })

    try {
      const payload = {
        tipo, nivel, valor,
        peso:   peso   !== undefined ? peso   : 10,
        activa: activa !== undefined ? activa : true,
      }
      const r    = await fetch(SUPABASE_URL + '/rest/v1/classification_rules', {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data[0] || {})
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // DELETE: Eliminar regla
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Falta parámetro ID' })
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/classification_rules?id=eq.' + id, {
        method: 'DELETE',
        headers: h,
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return res.status(r.status).json(err)
      }
      return res.status(200).json({ success: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
