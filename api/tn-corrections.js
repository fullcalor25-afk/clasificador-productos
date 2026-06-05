import { logRequest } from './_helpers.js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  logRequest('tn-corrections', { method: req.method, query: req.query, body: req.body })

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  const h = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
  }

  const qs = req.query

  // ── GET: lista con paginación y búsqueda opcionales ──────────────────────
  if (req.method === 'GET') {
    const page   = parseInt(qs.page  || '0', 10)
    const limit  = parseInt(qs.limit || '0', 10)
    const search = qs.search || ''

    let url = SUPABASE_URL + '/rest/v1/tn_corrections?select=*&order=updated_at.desc'

    if (search) {
      url += `&or=(codigo.ilike.*${encodeURIComponent(search)}*,producto.ilike.*${encodeURIComponent(search)}*)`
    }

    const fetchHeaders = { ...h }
    if (limit > 0) {
      const from = page * limit
      const to   = from + limit - 1
      fetchHeaders['Range']  = `${from}-${to}`
      fetchHeaders['Prefer'] = 'count=exact'
    }

    try {
      const r    = await fetch(url, { headers: fetchHeaders })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json(data)
      return res.status(200).json(data)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST: upsert por codigo ──────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request inválido' })

    const codigo      = (body.codigo || '').trim()
    const categoriaTN = (body.categoria_tiendanube || '').trim()
    const producto    = body.producto || ''

    if (!codigo || !categoriaTN)
      return res.status(400).json({ error: 'Se requieren codigo y categoria_tiendanube' })

    const payload = {
      codigo,
      producto,
      categoria_tiendanube: categoriaTN,
      updated_at: new Date().toISOString(),
    }

    const r = await fetch(SUPABASE_URL + '/rest/v1/tn_corrections', {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }

    const data = await r.json().catch(() => [])
    return res.status(200).json(Array.isArray(data) ? (data[0] || { success: true }) : { success: true })
  }

  // ── DELETE: por id, codigo o ?all=true ────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id, codigo, all } = qs

    if (all === 'true') {
      const r = await fetch(SUPABASE_URL + '/rest/v1/tn_corrections?id=gt.0', {
        method: 'DELETE',
        headers: { ...h, Prefer: 'return=minimal' },
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return res.status(r.status).json(err)
      }
      return res.status(200).json({ success: true })
    }

    if (id) {
      const r = await fetch(SUPABASE_URL + '/rest/v1/tn_corrections?id=eq.' + id, {
        method: 'DELETE',
        headers: { ...h, Prefer: 'return=minimal' },
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return res.status(r.status).json(err)
      }
      return res.status(200).json({ success: true })
    }

    if (codigo) {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/tn_corrections?codigo=eq.' + encodeURIComponent(codigo),
        { method: 'DELETE', headers: { ...h, Prefer: 'return=minimal' } }
      )
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        return res.status(r.status).json(err)
      }
      return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Falta parámetro: id, codigo o all=true' })
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
