function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  const h = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
  }

  const { id } = req.query

  // GET — devuelve todas las categorías TN ordenadas
  if (req.method === 'GET') {
    try {
      const r    = await fetch(
        SUPABASE_URL + '/rest/v1/tiendanube_categories?select=*&activa=eq.true&order=nivel1.asc,nivel2.asc,nivel3.asc,orden.asc',
        { headers: h }
      )
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // POST — crear fila
  if (req.method === 'POST') {
    const body = req.body
    if (!body || !body.nivel1)
      return res.status(400).json({ error: 'nivel1 es obligatorio' })

    const payload = {
      nivel1:    body.nivel1,
      nivel2:    body.nivel2    || null,
      nivel3:    body.nivel3    || null,
      nivel4:    body.nivel4    || null,
      keywords:  body.keywords  || null,
      activa:    body.activa    !== undefined ? body.activa : true,
      orden:     body.orden     || 0,
    }

    try {
      const r    = await fetch(SUPABASE_URL + '/rest/v1/tiendanube_categories', {
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
      const r = await fetch(SUPABASE_URL + '/rest/v1/tiendanube_categories?id=eq.' + id, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
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

  // DELETE — eliminar fila
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Falta id' })
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/tiendanube_categories?id=eq.' + id, {
        method: 'DELETE',
        headers: { ...h, Prefer: 'return=minimal' },
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
