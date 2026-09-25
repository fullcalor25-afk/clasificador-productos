// Normalizacion de nombres aprendida POR CATEGORIA.
//
// corrections aprende por CODIGO: sirve para un producto que ya se vio. Esto
// aprende por CATEGORIA, asi un producto nuevo hereda la forma de nombrar que
// el usuario ya confirmo para su categoria.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ REGLA DE ORO — NO "MEJORAR" ESTO DESPUES                                │
// │                                                                          │
// │ Si la categoria tiene MENOS DE 3 ejemplos confirmados, o si la IA        │
// │ devuelve una confianza MENOR A 80, la respuesta es nombre_sugerido:      │
// │ null. No se sugiere nada.                                               │
// │                                                                          │
// │ Es deliberado y es conservador: un nombre malo aplicado en masa es peor  │
// │ que no tocar nada, porque se propaga al CSV, de ahi a Tienda Nube, y     │
// │ despues hay que corregirlo producto por producto. No bajar estos         │
// │ umbrales para "conseguir mas sugerencias" — el objetivo no es sugerir    │
// │ mucho, es no equivocarse.                                               │
// └─────────────────────────────────────────────────────────────────────────┘

import { supabaseQuery, llamarGemini, normPath } from './_helpers.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-120b'

// Los dos umbrales de la regla de oro, en un solo lugar.
const MIN_EJEMPLOS = 3
const MIN_CONFIANZA = 80

const TABLE = '/rest/v1/naming_patterns'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-groq-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
}

/** Llama a Groq y cae a Gemini, igual que classify y enrich. */
async function llamarIA({ systemPrompt, userPrompt, groqKey }) {
  if (groqKey) {
    try {
      const r = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + groqKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })
      if (r.ok) {
        const data = await r.json()
        const txt = data?.choices?.[0]?.message?.content
        if (txt) return txt
      }
      console.log('[naming-patterns] Groq no sirvio (' + r.status + '), probando Gemini')
    } catch (e) {
      console.log('[naming-patterns] Groq fallo:', e.message)
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) throw new Error('No hay ningun proveedor de IA disponible')
  return llamarGemini({ systemPrompt, userPrompt, apiKey: geminiKey, temperature: 0.1 })
}

function parseJson(txt) {
  let s = (txt || '').trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b === -1) throw new Error('La IA no devolvio un JSON valido')
  return JSON.parse(s.slice(a, b + 1))
}

function muestrasDe(fila) {
  const m = fila?.muestras_json
  if (Array.isArray(m)) return m
  if (typeof m === 'string') { try { return JSON.parse(m) } catch { return [] } }
  return []
}

// ── Prompt ───────────────────────────────────────────────────────────────────
// Few-shot puro: los ejemplos SON la definicion del patron. No se describe el
// formato deseado con palabras, porque lo que el usuario quiere esta en como
// nombro los productos, no en como alguien lo redacte en un prompt.
function buildPrompt(estructura, muestras) {
  const ejemplos = muestras
    .slice(-12) // los mas recientes mandan: el criterio del usuario puede cambiar
    .map(m => `"${m.nombre_original}"  ->  "${m.nombre_normalizado}"`)
    .join('\n')

  return `Sos un asistente que normaliza nombres de repuestos HVAC para una tienda online argentina.

El usuario ya normalizo a mano estos productos de ESTA MISMA categoria. Imita su criterio:

${ejemplos}
${estructura ? `\nEstructura observada: ${estructura}\n` : ''}
Para cada producto que te paso, devolve el nombre normalizado siguiendo EXACTAMENTE ese criterio.

Respondé SOLO un JSON:
{"results":[{"codigo":"...","nombre_sugerido":"...","confianza":85,"razon":"una linea"}]}

REGLAS:
- "confianza" es 0-100 y tiene que ser honesta. Si el producto no se parece a los ejemplos, poné confianza baja. Una confianza inflada es peor que no contestar.
- Si no podés inferir el nombre con el criterio de los ejemplos, devolvé "nombre_sugerido": null.
- No inventes marca, modelo ni medidas que no esten en el nombre original ni en los datos que te paso.
- No traduzcas ni "corrijas" codigos OEM: van tal cual.
- "razon" en español, una linea, explicando que patron aplicaste.`
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  const userKey = req.headers['x-groq-key']
  const groqKey = (typeof userKey === 'string' && userKey.trim()) ? userKey.trim() : process.env.GROQ_API_KEY

  // ── GET ?categoria=X → el patron aprendido de esa categoria ───────────────
  if (req.method === 'GET') {
    const categoria = (req.query?.categoria || '').trim()
    if (!categoria) return res.status(400).json({ error: 'Falta el parametro categoria' })
    try {
      const filas = await supabaseQuery(
        TABLE + '?select=*&categoria_norm=eq.' + encodeURIComponent(normPath(categoria)),
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      const fila = Array.isArray(filas) ? filas[0] : filas
      if (!fila) return res.status(200).json({ categoria_tiendanube: categoria, muestras: [], listo: false })
      const muestras = muestrasDe(fila)
      return res.status(200).json({
        ...fila,
        muestras,
        // listo = tiene ejemplos suficientes para que se pueda sugerir algo
        listo: muestras.length >= MIN_EJEMPLOS,
      })
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // ── POST { productos: [...] } → sugerencias para el lote ──────────────────
  if (req.method === 'POST') {
    const productos = req.body?.productos
    if (!Array.isArray(productos) || productos.length === 0)
      return res.status(400).json({ error: 'No se enviaron productos' })

    // 1. Agrupar por categoria, con la clave NORMALIZADA: si dos productos
    //    traen la misma categoria escrita con y sin tilde, es un solo grupo.
    const grupos = new Map()
    productos.forEach(p => {
      const cat = (p.categoria_tiendanube || '').trim()
      if (!cat) return
      const clave = normPath(cat)
      if (!grupos.has(clave)) grupos.set(clave, { categoria: cat, items: [] })
      grupos.get(clave).items.push(p)
    })

    if (grupos.size === 0) return res.status(200).json({ results: [] })

    // 2. Traer de una sola vez los patrones de todas las categorias del lote
    let patrones = []
    try {
      const inList = [...grupos.keys()].map(c => '"' + c.replace(/"/g, '\\"') + '"').join(',')
      patrones = await supabaseQuery(
        TABLE + '?select=*&categoria_norm=in.(' + encodeURIComponent(inList) + ')',
        {}, SUPABASE_URL, SUPABASE_KEY
      ) || []
    } catch (e) {
      console.log('[naming-patterns] no se pudieron leer los patrones:', e.message)
    }
    const porCategoria = new Map(patrones.map(p => [p.categoria_norm, p]))

    const results = []

    for (const [clave, grupo] of grupos) {
      const fila = porCategoria.get(clave)
      const muestras = muestrasDe(fila)

      // REGLA DE ORO, primera mitad: sin 3 ejemplos no se sugiere nada.
      if (muestras.length < MIN_EJEMPLOS) {
        grupo.items.forEach(p => results.push({
          codigo: p.codigo,
          nombre_sugerido: null,
          confianza: 0,
          razon: `La categoría tiene ${muestras.length} de ${MIN_EJEMPLOS} ejemplos necesarios. Normalizá algunos a mano y se empieza a sugerir solo.`,
        }))
        continue
      }

      const userPrompt = 'Productos a normalizar:\n' + JSON.stringify(
        grupo.items.map(p => ({
          codigo: p.codigo,
          nombre_actual: p.nombre_actual,
          marca: p.marca || null,
          prop1_valor: p.prop1_valor || null,
          prop2_valor: p.prop2_valor || null,
          prop3_valor: p.prop3_valor || null,
        })), null, 2)

      try {
        const txt = await llamarIA({
          systemPrompt: buildPrompt(fila?.estructura, muestras),
          userPrompt,
          groqKey,
        })
        const parsed = parseJson(txt)
        const sugerencias = Array.isArray(parsed.results) ? parsed.results : []
        const porCodigo = new Map(sugerencias.map(s => [String(s.codigo), s]))

        grupo.items.forEach(p => {
          const s = porCodigo.get(String(p.codigo))
          const conf = Number(s?.confianza) || 0
          const nombre = (s?.nombre_sugerido || '').trim()

          // REGLA DE ORO, segunda mitad: por debajo del umbral, no se sugiere.
          // Tampoco se sugiere un nombre identico al actual: no es una mejora,
          // solo ruido en la lista que el usuario tiene que revisar.
          const sirve = nombre && conf >= MIN_CONFIANZA && nombre !== (p.nombre_actual || '').trim()

          results.push({
            codigo: p.codigo,
            nombre_sugerido: sirve ? nombre : null,
            confianza: conf,
            razon: sirve
              ? (s.razon || `Coincide con el patrón de ${muestras.length} productos de esta categoría`)
              : (nombre && conf < MIN_CONFIANZA
                  ? `Confianza ${conf}% — por debajo del mínimo de ${MIN_CONFIANZA}%, no se sugiere`
                  : 'Sin un patrón claro para este producto'),
          })
        })
      } catch (e) {
        console.error('[naming-patterns] IA fallo en "' + grupo.categoria + '":', e.message)
        // Que falle la IA no rompe el lote: esos productos quedan sin sugerencia.
        grupo.items.forEach(p => results.push({
          codigo: p.codigo,
          nombre_sugerido: null,
          confianza: 0,
          razon: 'No se pudo consultar la IA: ' + e.message,
        }))
      }
    }

    return res.status(200).json({ results })
  }

  // ── PATCH { codigo, nombre_normalizado, categoria_tiendanube } ────────────
  // Guarda la correccion del usuario Y la suma al patron de la categoria.
  if (req.method === 'PATCH') {
    const { codigo, nombre_normalizado, categoria_tiendanube, nombre_original } = req.body || {}
    if (!codigo || !nombre_normalizado)
      return res.status(400).json({ error: 'Falta codigo o nombre_normalizado' })
    if (!categoria_tiendanube)
      return res.status(400).json({ error: 'Falta categoria_tiendanube' })

    const nombre = String(nombre_normalizado).trim()
    const clave = normPath(categoria_tiendanube)

    // 1. corrections: la fuente de verdad por CODIGO. Se respeta su lógica
    //    actual — solo se toca nombre_limpio.
    try {
      await supabaseQuery('/rest/v1/corrections?on_conflict=codigo', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          codigo,
          nombre_limpio: nombre,
          updated_at: new Date().toISOString(),
        }]),
      }, SUPABASE_URL, SUPABASE_KEY)
    } catch (e) {
      // Sin esto no hay nada que aprender: es un error de verdad.
      return res.status(e.status || 500).json({ error: 'No se pudo guardar la corrección: ' + e.message })
    }

    // 2. naming_patterns: sumar la muestra a la categoria.
    try {
      const filas = await supabaseQuery(
        TABLE + '?select=*&categoria_norm=eq.' + encodeURIComponent(clave),
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      const fila = Array.isArray(filas) ? filas[0] : filas
      const muestras = muestrasDe(fila)

      // Una muestra por codigo: si se corrige dos veces el mismo producto,
      // vale la ultima. Si no, un producto retocado varias veces pesaria mas
      // que los demas al inferir el patron.
      const sinEste = muestras.filter(m => String(m.codigo || '') !== String(codigo))
      const nuevas = [...sinEste, {
        codigo,
        nombre_original: nombre_original || null,
        nombre_normalizado: nombre,
      }].slice(-50) // tope: el prompt igual usa los ultimos 12

      const payload = {
        categoria_tiendanube,
        categoria_norm: clave,
        muestras_json: nuevas,
        veces_aplicado: (fila?.veces_aplicado || 0) + 1,
        patron_ejemplo: nombre,
        updated_at: new Date().toISOString(),
      }

      // Recien con MIN_EJEMPLOS tiene sentido pedirle a la IA que describa la
      // estructura. Con menos, cualquier "patron" seria una invencion.
      if (nuevas.length >= MIN_EJEMPLOS) {
        try {
          const txt = await llamarIA({
            systemPrompt: 'Analizá cómo se renombraron estos productos y describí la estructura en una línea, con placeholders tipo "{tipo_pieza} {equipo} {marca} {modelo}". Respondé SOLO {"estructura":"..."}.',
            userPrompt: JSON.stringify(nuevas.slice(-12), null, 2),
            groqKey,
          })
          const est = parseJson(txt)?.estructura
          if (est) payload.estructura = String(est).slice(0, 200)
        } catch (e) {
          // La estructura es una ayuda para el prompt, no un requisito: los
          // ejemplos por si solos ya alcanzan para el few-shot.
          console.log('[naming-patterns] no se pudo inferir la estructura:', e.message)
        }
      }

      await supabaseQuery(TABLE + '?on_conflict=categoria_norm', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([payload]),
      }, SUPABASE_URL, SUPABASE_KEY)

      return res.status(200).json({
        success: true,
        muestras: nuevas.length,
        listo: nuevas.length >= MIN_EJEMPLOS,
        faltan: Math.max(0, MIN_EJEMPLOS - nuevas.length),
      })
    } catch (e) {
      // El nombre YA se guardo en corrections, que es lo que importa. Que
      // falle el aprendizaje del patron no puede reportarse como fracaso.
      console.error('[naming-patterns] no se pudo actualizar el patron:', e.message)
      return res.status(200).json({
        success: true,
        aviso: 'El nombre se guardó, pero no se pudo actualizar el patrón de la categoría.',
      })
    }
  }

  return res.status(405).json({ error: 'Metodo no permitido' })
}
