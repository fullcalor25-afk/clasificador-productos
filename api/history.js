function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
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

  const { id, from, to } = req.query

  // GET lista o detalle
  if (req.method === 'GET') {
    if (id) {
      const [anaRes, prodRes] = await Promise.all([
        fetch(SUPABASE_URL + '/rest/v1/analyses?id=eq.' + id + '&select=*', { headers: h }),
        fetch(SUPABASE_URL + '/rest/v1/analysis_products?analysis_id=eq.' + id + '&select=*&order=id.asc', { headers: h }),
      ])
      const [analysis, products] = await Promise.all([anaRes.json(), prodRes.json()])
      if (!anaRes.ok) return res.status(anaRes.status).json(analysis)
      return res.status(200).json({ ...analysis[0], products })
    }

    // Lista con filtros de fecha
    let listUrl = SUPABASE_URL + '/rest/v1/analyses?select=*&order=created_at.desc'
    if (from) listUrl += '&created_at=gte.' + from + '-01T00:00:00Z'
    if (to)   listUrl += '&created_at=lte.' + to   + '-31T23:59:59Z'

    const r    = await fetch(listUrl, { headers: h })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json(data)

    // Anotar has_enriched
    const enrichedCheck = await Promise.all(
      data.map(async (a) => {
        try {
          const er   = await fetch(
            SUPABASE_URL + '/rest/v1/analysis_products?analysis_id=eq.' + a.id + '&slug=not.is.null&select=id&limit=1',
            { headers: h }
          )
          const rows = await er.json()
          return { ...a, has_enriched: Array.isArray(rows) && rows.length > 0 }
        } catch (_) {
          return { ...a, has_enriched: false }
        }
      })
    )

    return res.status(200).json(enrichedCheck)
  }

  // POST crear análisis
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request invalido' })
    const nombre   = (body.nombre || body.name || '').trim()
    const rawProds = body.productos || body.products || []
    if (!nombre || !Array.isArray(rawProds))
      return res.status(400).json({ error: 'Faltan campos obligatorios' })

    // Normalize field names — accept both lowercase and UPPERCASE keys
    const productos = rawProds.map(p => ({
      codigo:           p.codigo         || p.CODIGO           || '',
      producto:         p.producto       || p.PRODUCTO         || '',
      rubro:            p.rubro          || p.RUBRO            || '',
      sub_rubro:        p.sub_rubro      || p['SUB RUBRO']     || p.subRubro || '',
      clasificacion:    p.clasificacion  || p.CLASIFICACION    || 'OTRO',
      fuente:           p.fuente         || p.FUENTE           || 'REGLAS',
      confianza:        parseInt(p.confianza || p.CONFIANZA || 0),
      category_id:      p.category_id    || p.categoryId       || null,
      subcategory_id:   p.subcategory_id || p.subcategoryId    || null,
      tipo:             p.tipo           || p.TIPO             || null,
      slug:             p.slug           || p._enriched?.slug  || null,
      nombre_limpio:    p.nombre_limpio  || p._enriched?.nombre_limpio || null,
      marca:            p.marca          || p._enriched?.marca || null,
      descripcion_html: p.descripcion_html || p._enriched?.descripcion_html || null,
      tags:             Array.isArray(p.tags) ? JSON.stringify(p.tags) : (p.tags || null),
      seo_titulo:       p.seo_titulo       || p._enriched?.seo_titulo    || null,
      seo_descripcion:  p.seo_descripcion  || p._enriched?.seo_descripcion || null,
      peso_kg:          parseFloat(p.peso_kg || p._enriched?.peso_kg) || null,
      alto_cm:          parseFloat(p.alto_cm || p._enriched?.alto_cm) || null,
      ancho_cm:         parseFloat(p.ancho_cm || p._enriched?.ancho_cm) || null,
      profundidad_cm:   parseFloat(p.profundidad_cm || p._enriched?.profundidad_cm) || null,
      categoria_tiendanube: p.categoria_tiendanube || p._enriched?.categoria_tiendanube || null,
    }))

    const stats = { total: productos.length, repuestos: 0, accesorios: 0, completos: 0, servicios: 0, otros: 0, aprendidos: 0 }
    productos.forEach(p => {
      const cls = p.clasificacion || 'OTRO'
      if      (cls === 'REPUESTO')          stats.repuestos++
      else if (cls === 'ACCESORIO')         stats.accesorios++
      else if (cls === 'PRODUCTO_COMPLETO') stats.completos++
      else if (cls === 'SERVICIO')          stats.servicios++
      else                                  stats.otros++
      if (p.fuente === 'APRENDIDO') stats.aprendidos++
    })

    const anaRes  = await fetch(SUPABASE_URL + '/rest/v1/analyses', {
      method: 'POST',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ nombre, ...stats, created_at: new Date().toISOString() }),
    })
    const anaData = await anaRes.json()
    if (!anaRes.ok) return res.status(anaRes.status).json(anaData)

    const analysisId = anaData[0].id
    const BATCH = 100
    for (let i = 0; i < productos.length; i += BATCH) {
      const batch = productos.slice(i, i + BATCH).map(p => ({ ...p, analysis_id: analysisId }))
      const bRes  = await fetch(SUPABASE_URL + '/rest/v1/analysis_products', {
        method: 'POST',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(batch),
      })
      if (!bRes.ok) {
        const err = await bRes.json().catch(() => ({}))
        console.error('[history] Error insertando lote', i, JSON.stringify(err).substring(0, 200))
      }
    }
    return res.status(200).json({ id: analysisId })
  }

  // PUT renombrar
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Falta id' })
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request invalido' })
    const r = await fetch(SUPABASE_URL + '/rest/v1/analyses?id=eq.' + id, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({ nombre: body.nombre }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }
    return res.status(200).json({ success: true })
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Falta id' })
    const r = await fetch(SUPABASE_URL + '/rest/v1/analyses?id=eq.' + id, {
      method: 'DELETE',
      headers: { ...h, Prefer: 'return=minimal' },
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }
    return res.status(200).json({ success: true })
  }

  // PATCH: actualizar clasificación de un producto individual del historial
  if (req.method === 'PATCH') {
    if (!id) return res.status(400).json({ error: 'Falta id del análisis' })
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request inválido' })
    const { productId, clasificacion, fuente, confianza } = body
    if (!productId) return res.status(400).json({ error: 'Falta productId' })

    const patch = {}
    if (clasificacion !== undefined) patch.clasificacion = clasificacion
    if (fuente        !== undefined) patch.fuente        = fuente
    if (confianza     !== undefined) patch.confianza     = confianza

    if (Object.keys(patch).length === 0)
      return res.status(400).json({ error: 'No hay campos para actualizar' })

    const r = await fetch(
      SUPABASE_URL + '/rest/v1/analysis_products?id=eq.' + productId + '&analysis_id=eq.' + id,
      {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }
    )
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json(err)
    }
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Metodo no permitido' })
}
