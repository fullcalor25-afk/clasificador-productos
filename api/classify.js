import { createClient } from '@supabase/supabase-js'
import { llamarGemini, CEREBRAS_MODEL, CEREBRAS_URL, CEREBRAS_MAX_TOKENS } from './_helpers.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Arma el orden de intentos de este lote.
 *
 * Groq y Cerebras corren el MISMO modelo (gpt-oss-120b) con cuotas separadas,
 * así que alternar cuál va primero según el número de lote reparte el límite
 * entre las dos sin que el catálogo salga con criterios distintos: es el mismo
 * modelo el que clasifica, solo cambia quién lo hospeda.
 *
 * Sin CEREBRAS_API_KEY la lista queda igual que antes (Groq 120b → 20b), así
 * que la rotación es opcional: si no está la key, no cambia nada.
 */
function construirIntentos(lote, groqKey, cerebrasKey) {
  const groq120 = { tipo: 'groq', model: 'openai/gpt-oss-120b', url: GROQ_URL, key: groqKey }
  const groq20  = { tipo: 'groq', model: 'openai/gpt-oss-20b',  url: GROQ_URL, key: groqKey }

  if (!cerebrasKey) return [groq120, groq20]

  const cerebras = {
    tipo: 'cerebras',
    model: CEREBRAS_MODEL,
    url: CEREBRAS_URL,
    key: cerebrasKey,
    maxTokens: CEREBRAS_MAX_TOKENS,
  }

  // gpt-oss-20b queda último en los dos casos: es el modelo más chico y solo
  // tiene sentido cuando el grande no está disponible en ningún proveedor.
  return lote % 2 === 0
    ? [groq120, cerebras, groq20]
    : [cerebras, groq120, groq20]
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
}

function getSystemPrompt(examples, tnCategories) {
  let examplesText = ''
  if (examples && examples.length > 0) {
    examplesText =
      '\n\nIMPORTANTE - APRENDIZAJE DE EJEMPLOS PREVIOS DEL USUARIO:\n' +
      'A continuacion se muestran ejemplos de como el usuario ha clasificado manualmente algunos productos en el pasado. ' +
      'DEBES prestar mucha atencion a la logica detras de estos ejemplos y aplicarla a los nuevos productos si son similares.\n\n' +
      '--- EJEMPLOS ---\n' +
      examples.map(e => `Producto: "${e.producto}" | Rubro: "${e.rubro}" | Clasificacion correcta: ${e.clasificacion_manual}`).join('\n') +
      '\n----------------\n\n'
  }

  let categoriesText = ''
  if (tnCategories && tnCategories.length > 0) {
    const paths = tnCategories
      .map(c => [c.nivel1, c.nivel2, c.nivel3, c.nivel4].filter(Boolean).join(' > '))
      .filter(Boolean)
    const uniquePaths = [...new Set(paths)]
    if (uniquePaths.length > 0) {
      categoriesText =
        '\n\nAdemas de clasificar, asigna a cada producto la CATEGORIA de Tienda Nube mas apropiada de esta lista:\n\n' +
        'CATEGORIAS TIENDA NUBE DISPONIBLES:\n' + uniquePaths.join('\n') +
        '\n\nAgrega el campo categoria_tiendanube a cada objeto con el path completo exacto de la lista. ' +
        'Si no corresponde a ninguna, usa "Repuestos y Accesorios".\n' +
        'Ejemplo: {"codigo":"X","clasificacion":"REPUESTO","confianza":85,"razon":"breve",' +
        '"categoria_tiendanube":"Repuestos y Accesorios > Calefaccion > Calderas > Plaquetas"}'
    }
  }

  return `Eres un experto en clasificacion de productos industriales (calefaccion, plomeria, gas, herramientas, electricidad, jardineria, refrigeracion, etc).

Tu unica tarea es analizar la lista de productos provista y clasificarlos.
DEBES responder UNICAMENTE con un objeto JSON valido que contenga una propiedad "results", la cual debe ser un array de objetos.
Cada objeto en el array "results" debe tener exactamente esta estructura:
{
  "codigo": "el codigo original del producto",
  "clasificacion": "UNA DE LAS SIGUIENTES CATEGORIAS EXACTAS: REPUESTO, ACCESORIO, PRODUCTO_COMPLETO, SERVICIO, OTRO",
  "confianza": 85,
  "razon": "Explicacion breve de 1 linea de por que se eligio esa categoria"
}

Criterios de clasificacion estricta:
- REPUESTO: pieza que reemplaza una parte dañada de un equipo mayor (diafragmas, electrodos, valvulas, plaquetas, correas, sensores, termocuplas, membranas, unidades magneticas, fichas, etc.)
- ACCESORIO: pieza complementaria para instalaciones (cuplas, racores, tees, codos, conectores, adaptadores, niples, abrazaderas, desfangadores, filtros de linea, etc.)
- PRODUCTO_COMPLETO: equipo principal autonomo que funciona por si solo (calderas, bombas, extractores, compresores, herramientas electricas, salamandras, equipos de aire, cortacercos, electrobombas, escaleras, etc.)
- SERVICIO: mano de obra, instalacion o servicio tecnico
- OTRO: no encaja claramente en ninguna categoria anterior (pilas, materiales genericos, cortinas, etc.)
${examplesText}${categoriesText}
IMPORTANTE:
1. La clasificacion DEBE ser una de las opciones exactas en MAYUSCULAS.
2. Tu respuesta debe ser solo el JSON.`
}

function buildUserPrompt(products) {
  const sample = []
  for (let i = 0; i < Math.min(products.length, 50); i++) {
    const p = products[i]
    sample.push({
      codigo:   p.CODIGO      || '',
      producto: p.PRODUCTO    || '',
      rubro:    p.RUBRO       || '',
      subRubro: p['SUB RUBRO'] || '',
    })
  }
  return 'Productos a clasificar:\n' + JSON.stringify(sample, null, 2)
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const userKey = req.headers['x-groq-key']
  const apiKey = (typeof userKey === 'string' && userKey.trim()) ? userKey.trim() : process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada en Vercel.' })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY
  let supabase = null
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
  }

  const { products, lote } = req.body || {}
  if (!products || !Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No se enviaron productos' })

  // Número de lote del frontend: decide cuál proveedor arranca, para repartir
  // la carga entre las dos cuotas. Si no viene, arranca siempre por Groq.
  const numeroLote = Number.isInteger(lote) ? lote : 0
  const intentos = construirIntentos(numeroLote, apiKey, process.env.CEREBRAS_API_KEY)
  // Aviso de configuración que viaja con la respuesta exitosa (ver el 401/403
  // de Cerebras más abajo): un problema de key no puede quedar solo en los logs.
  let avisoConfig = null

  // 1. Cargar ejemplos manuales recientes de Supabase
  let recentCorrections = []
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('clasificaciones')
        .select('producto, rubro, clasificacion_manual')
        .not('clasificacion_manual', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(20)
      if (!error && data) {
        recentCorrections = data
        console.log('Ejemplos cargados de Supabase:', recentCorrections.length)
      }
    } catch (e) {
      console.log('Error consultando ejemplos de Supabase:', e.message)
    }
  }

  // 2. Cargar categorías TN de Supabase para enriquecer el prompt
  let tnCategories = []
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tiendanube_categories')
        .select('nivel1, nivel2, nivel3, nivel4')
        .eq('activa', true)
      if (!error && data) {
        tnCategories = data
        console.log('Categorías TN cargadas:', tnCategories.length)
      }
    } catch (e) {
      console.log('Error cargando categorías TN:', e.message)
    }
  }

  const userPrompt   = buildUserPrompt(products)
  const systemPrompt = getSystemPrompt(recentCorrections, tnCategories)

  // Guardado + respuesta, compartidos por Groq y por Gemini
  async function responder(results, provider) {
  // 2. Guardar en Supabase (tabla legacy clasificaciones)
  if (supabase) {
    try {
      const upsertData = results.map(r => {
        const op = products.find(p => (p.CODIGO || '') === r.codigo) || {}
        if (!r.codigo) return null
        return {
          codigo:          r.codigo,
          producto:        op.PRODUCTO    || '',
          rubro:           op.RUBRO       || '',
          sub_rubro:       op['SUB RUBRO'] || '',
          clasificacion_ia: r.clasificacion,
          updated_at:      new Date().toISOString(),
        }
      }).filter(Boolean)
      if (upsertData.length > 0) {
        const { error: insertError } = await supabase
          .from('clasificaciones')
          .upsert(upsertData, { onConflict: 'codigo' })
        if (insertError) console.log('Advertencia Supabase:', insertError.message)
      }
    } catch (e) {
      console.log('Error guardando en Supabase:', e.message)
    }
  }

  return res.status(200).json({ results, provider, ...(avisoConfig ? { aviso: avisoConfig } : {}) })
  }

  let lastError = 'Error desconocido'
  // Proveedores que ya contestaron 429. Una cuota por minuto no se libera en
  // segundos, así que no se vuelve a probar el mismo proveedor en este lote —
  // pero sí el otro, que tiene cuota aparte. Ese es el punto de la rotación.
  const limitados = new Set()
  const attemptCounts = {}
  const MAX_ATTEMPTS_PER_MODEL = 2

  for (let m = 0; m < intentos.length; m++) {
    const { tipo, model, url, key, maxTokens } = intentos[m]
    if (limitados.has(tipo)) {
      console.log(`[classify] Salteando ${model}: ${tipo} ya esta limitado en este lote`)
      continue
    }

    attemptCounts[m] = (attemptCounts[m] || 0) + 1
    console.log(`Intentando ${tipo}:`, model, '- intento', attemptCounts[m])

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + key,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
        }),
      })

      if (response.status === 429) {
        // Cuota agotada en este proveedor. Se marca y se sigue con el otro,
        // que tiene su propio límite; Gemini queda para si fallan los dos.
        lastError = 'Rate limit en ' + model + ' (' + tipo + ')'
        limitados.add(tipo)
        console.log(`[classify] ${tipo} limitado, probando el siguiente proveedor`)
        continue
      }
      if (response.status === 503 || response.status === 500) {
        lastError = 'Modelo sobrecargado en ' + model
        if (attemptCounts[m] < MAX_ATTEMPTS_PER_MODEL) {
          const backoff = 6000
          console.log(`[classify] ${lastError}, esperando ${backoff}ms antes de reintentar (intento ${attemptCounts[m]}/${MAX_ATTEMPTS_PER_MODEL})`)
          await wait(backoff)
          m--
        } else {
          console.log(`[classify] ${lastError} (sin mas reintentos, intento ${attemptCounts[m]}/${MAX_ATTEMPTS_PER_MODEL})`)
        }
        continue
      }
      if (response.status === 401 || response.status === 403) {
        // La key de Groq es la principal: si está mal, hay que verlo y arreglarlo.
        if (tipo === 'groq') {
          return res.status(401).json({ error: 'API Key de Groq invalida. Revisa tu GROQ_API_KEY.' })
        }
        // Cerebras es un agregado opcional: una key mala no puede frenar un
        // análisis que Groq puede hacer igual. Se saltea, pero el aviso viaja
        // en la respuesta para que no quede escondido en los logs de Vercel.
        avisoConfig = 'CEREBRAS_API_KEY invalida o sin permisos — se clasifico sin Cerebras. Revisala en Vercel.'
        limitados.add(tipo)
        console.log('[classify]', avisoConfig)
        continue
      }
      if (!response.ok) {
        const errTxt = await response.text()
        lastError = 'Error ' + response.status + ' en ' + model + ': ' + errTxt.substring(0, 200)
        console.log('[classify]', lastError)
        continue
      }

      const data = await response.json()
      let text = ''
      try { text = data.choices[0].message.content } catch (e) {
        lastError = 'Sin choices en respuesta de ' + model
        console.log('[classify]', lastError, JSON.stringify(data).substring(0, 300))
        continue
      }
      if (!text) { lastError = 'Respuesta vacia de ' + model; console.log('[classify]', lastError); continue }

      let parsed
      try { parsed = JSON.parse(text) } catch (e) {
        lastError = 'Respuesta no parseable de ' + model
        console.log('[classify]', lastError, text.substring(0, 300))
        continue
      }

      const results = parsed.results
      if (!results || !Array.isArray(results)) {
        lastError = 'Formato de resultados incorrecto en ' + model
        console.log('[classify]', lastError, JSON.stringify(parsed).substring(0, 300))
        continue
      }

      console.log('Exito con', model, '(' + tipo + ') -', results.length, 'productos clasificados')
      return await responder(results, tipo)

    } catch (err) {
      console.log('Excepcion con', model, ':', err.message)
      lastError = 'Error de conexion con ' + model
    }
  }

  // ── Respaldo: Gemini ──────────────────────────────────────────────────────
  // Ningún proveedor de gpt-oss pudo (cuota agotada o modelos caídos). En vez
  // de frenar el análisis, se reintenta con Gemini.
  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    const motivo = limitados.size > 0
      ? 'Limitados: ' + [...limitados].join(', ')
      : 'Proveedores agotados'
    console.log('[classify]', motivo, '- probando con Gemini')
    try {
      const texto = await llamarGemini({
        systemPrompt,
        userPrompt,
        apiKey: geminiKey,
        temperature: 0.1,
      })
      const parsed = JSON.parse(texto)
      const results = parsed.results
      if (!results || !Array.isArray(results)) {
        throw new Error('Gemini devolvio un formato inesperado')
      }
      console.log('[classify] Exito con Gemini -', results.length, 'productos clasificados')
      return await responder(results, 'gemini')
    } catch (e) {
      console.log('[classify] Gemini tambien fallo:', e.message)
      lastError = lastError + ' | Gemini: ' + e.message
    }
  } else {
    console.log('[classify] Sin GEMINI_API_KEY, no hay respaldo')
  }

  console.log('[classify] Todos los modelos fallaron. Ultimo error:', lastError)
  return res.status(503).json({
    error: 'Todos los proveedores de IA fallaron. Espera unos minutos. Ultimo error: ' + lastError,
  })
}
