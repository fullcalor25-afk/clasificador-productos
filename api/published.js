import { logRequest, supabaseQuery } from './_helpers.js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
}

const CHUNK = 100

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  // ── GET: listado (opcionalmente filtrado por lote) ──────────────────────
  if (req.method === 'GET') {
    const { lote } = req.query || {}
    try {
      const path = '/rest/v1/productos_publicados?select=*&order=fecha_publicado.desc'
        + (lote ? '&lote=eq.' + encodeURIComponent(lote) : '')
      const data = await supabaseQuery(path, {}, SUPABASE_URL, SUPABASE_KEY)
      return res.status(200).json(data || [])
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Metodo no permitido' })

  const body = req.body
  if (!body) return res.status(400).json({ error: 'Request invalido' })
  logRequest('published', { keys: Object.keys(body) })

  // ── POST { check: [slug, ...] } → cuáles ya están publicados ────────────
  if (Array.isArray(body.check)) {
    const slugs = body.check.map(s => String(s || '').trim()).filter(Boolean)
    if (slugs.length === 0) return res.status(200).json({ publicados: [] })

    try {
      const publicados = []
      for (let i = 0; i < slugs.length; i += CHUNK) {
        const chunk = slugs.slice(i, i + CHUNK)
        // PostgREST in.(): valores entre comillas para tolerar cualquier caracter
        const inList = chunk.map(s => '"' + s.replace(/"/g, '\\"') + '"').join(',')
        const path = '/rest/v1/productos_publicados'
          + '?select=slug,codigo,lote,fecha_publicado'
          + '&slug=in.(' + encodeURIComponent(inList) + ')'
        const data = await supabaseQuery(path, {}, SUPABASE_URL, SUPABASE_KEY)
        if (Array.isArray(data)) publicados.push(...data)
      }
      return res.status(200).json({ publicados })
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // ── POST { mark: [{slug, codigo, categoria_tiendanube}], lote } ─────────
  // Se llama DESPUÉS de confirmar manualmente que la importación a Tienda
  // Nube salió bien — la app no puede saberlo sola.
  if (Array.isArray(body.mark)) {
    const lote = (body.lote || '').trim() || null
    const now = new Date().toISOString()
    const payloads = body.mark
      .map(p => ({
        slug: String(p.slug || '').trim(),
        codigo: p.codigo || null,
        categoria_tiendanube: p.categoria_tiendanube || null,
        lote,
        fecha_publicado: now,
      }))
      .filter(p => p.slug)

    if (payloads.length === 0)
      return res.status(400).json({ error: 'Ninguna fila valida en mark' })

    try {
      let marked = 0
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK)
        await supabaseQuery('/rest/v1/productos_publicados', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(chunk),
        }, SUPABASE_URL, SUPABASE_KEY)
        marked += chunk.length
      }
      return res.status(200).json({ success: true, marked, lote })
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  return res.status(400).json({ error: 'Se requiere check[] o mark[]' })
}
