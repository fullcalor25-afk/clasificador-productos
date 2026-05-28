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

  const { id, type } = req.query

  // GET — devuelve todas las categorías con subcategorías anidadas
  if (req.method === 'GET') {
    const [catRes, subRes] = await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/categories?select=*&order=orden.asc&activa=eq.true', { headers: h }),
      fetch(SUPABASE_URL + '/rest/v1/subcategories?select=*&order=orden.asc&activa=eq.true', { headers: h }),
    ])
    const [cats, subs] = await Promise.all([catRes.json(), subRes.json()])
    if (!catRes.ok) return res.status(catRes.status).json(cats)
    const merged = cats.map(cat => ({
      ...cat,
      subcategories: subs.filter(s => s.category_id === cat.id),
    }))
    return res.status(200).json(merged)
  }

  // POST — crear categoría o subcategoría
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request invalido' })

    if (body.type === 'subcategory') {
      const { category_id, nombre, descripcion, keywords, orden } = body
      if (!category_id || !nombre)
        return res.status(400).json({ error: 'Faltan campos obligatorios' })
      const r = await fetch(SUPABASE_URL + '/rest/v1/subcategories', {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ category_id, nombre, descripcion: descripcion || null, keywords: keywords || null, orden: orden || 0 }),
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data[0] || {})
    }

    const { nombre, color, icono, orden } = body
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' })
    const r = await fetch(SUPABASE_URL + '/rest/v1/categories', {
      method: 'POST',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ nombre, color: color || '#3b82f6', icono: icono || '📦', orden: orden || 0 }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)
    return res.status(200).json(data[0] || {})
  }

  // PUT — actualizar categoría o subcategoría
  if (req.method === 'PUT') {
    if (!id || !type) return res.status(400).json({ error: 'Faltan parámetros id o type' })
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request invalido' })

    const table = type === 'subcategory' ? 'subcategories' : 'categories'
    const allowedCat = ['nombre', 'color', 'icono', 'orden', 'activa']
    const allowedSub = ['nombre', 'descripcion', 'keywords', 'orden', 'activa']
    const allowed = type === 'subcategory' ? allowedSub : allowedCat
    const patch = {}
    allowed.forEach(k => { if (body[k] !== undefined) patch[k] = body[k] })

    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }
    return res.status(200).json({ success: true })
  }

  // DELETE — eliminar categoría o subcategoría
  if (req.method === 'DELETE') {
    if (!id || !type) return res.status(400).json({ error: 'Faltan parámetros id o type' })
    const table = type === 'subcategory' ? 'subcategories' : 'categories'
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
      method: 'DELETE',
      headers: { ...h, Prefer: 'return=minimal' },
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Metodo no permitido' })
}
