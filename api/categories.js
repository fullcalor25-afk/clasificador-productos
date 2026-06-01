import { logRequest, supabaseQuery } from './_helpers.js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  logRequest('categories', { method: req.method, query: req.query, body: req.body })

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

    const nombre      = (body.nombre || body.name || body.label || '').trim()
    const color       = body.color || '#3b82f6'
    const icono       = body.icono || body.icon || body.emoji || '📦'
    const orden       = body.orden || body.order || 0
    const category_id = body.category_id || body.categoryId || null

    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' })

    if (body.type === 'subcategory') {
      if (!category_id)
        return res.status(400).json({ error: 'Faltan campos obligatorios' })
      const r = await fetch(SUPABASE_URL + '/rest/v1/subcategories', {
        method: 'POST',
        headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ category_id, nombre, descripcion: body.descripcion || null, keywords: body.keywords || null, orden }),
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data[0] || {})
    }

    const r = await fetch(SUPABASE_URL + '/rest/v1/categories', {
      method: 'POST',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ nombre, color, icono, orden }),
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
