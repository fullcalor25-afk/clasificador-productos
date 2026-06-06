import { createClient } from '@supabase/supabase-js'

const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']

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

  console.log('GROQ_API_KEY exists:', !!process.env.GROQ_API_KEY)
  console.log('GROQ_API_KEY prefix:', process.env.GROQ_API_KEY?.substring(0, 8))

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada en Vercel.' })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY
  let supabase = null
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey)
  }

  const { products } = req.body || {}
  if (!products || !Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No se enviaron productos' })

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
  let lastError = 'Error desconocido'

  for (let m = 0; m < MODELS.length; m++) {
    const model = MODELS[m]
    console.log('Intentando modelo Groq:', model)

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })

      if (response.status === 429) { lastError = 'Rate limit en ' + model; continue }
      if (response.status === 503 || response.status === 500) { lastError = 'Modelo ' + model + ' sobrecargado'; continue }
      if (response.status === 401) return res.status(401).json({ error: 'API Key de Groq invalida. Revisa tu GROQ_API_KEY.' })
      if (!response.ok) {
        const errTxt = await response.text()
        lastError = 'Error ' + response.status + ' en ' + model + ': ' + errTxt.substring(0, 200)
        continue
      }

      const data = await response.json()
      let text = ''
      try { text = data.choices[0].message.content } catch (e) { continue }
      if (!text) { lastError = 'Respuesta vacia de ' + model; continue }

      let parsed
      try { parsed = JSON.parse(text) } catch (e) { lastError = 'Respuesta no parseable de ' + model; continue }

      const results = parsed.results
      if (!results || !Array.isArray(results)) { lastError = 'Formato de resultados incorrecto en ' + model; continue }

      console.log('Exito con', model, '-', results.length, 'productos clasificados')

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

      return res.status(200).json({ results })

    } catch (err) {
      console.log('Excepcion con', model, ':', err.message)
      lastError = 'Error de conexion con ' + model
    }
  }

  return res.status(503).json({
    error: 'Todos los modelos de Groq fallaron. Espera unos minutos. Ultimo error: ' + lastError,
  })
}
