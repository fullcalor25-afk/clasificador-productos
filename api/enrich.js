const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]

const BASE_SYSTEM_PROMPT = `Sos un experto en productos HVAC (calefaccion, refrigeracion, gas, agua sanitaria) y en e-commerce argentino. Para cada producto genera datos para una tienda online.

Responde SOLO con JSON array valido, sin markdown ni backticks.
Formato exacto por producto:
{
  "codigo": "...",
  "slug": "nombre-en-minusculas-sin-acentos-con-guiones",
  "nombre_limpio": "Nombre Capitalizado Correctamente",
  "marca": "Marca extraida del nombre o proveedor",
  "descripcion_html": "<p>Descripcion del producto en 2-3 oraciones.</p><hr/><h3>Especificaciones tecnicas</h3><ul><li><p>Compatible con: marcas detectadas</p></li><li><p>Tipo: tipo de repuesto</p></li></ul>",
  "tags": ["tag1", "tag2"],
  "seo_titulo": "Nombre Producto | Categoria | Marca (max 70 chars)",
  "seo_descripcion": "Descripcion breve para SEO (max 160 chars)",
  "peso_kg": 0.2,
  "alto_cm": 5,
  "ancho_cm": 8,
  "profundidad_cm": 3,
  "categoria_tiendanube": "Repuestos y Accesorios > Calefaccion > Calderas > Plaquetas"
}

Estima peso y dimensiones segun el tipo:
- Diafragma/membrana: peso 0.1-0.3 kg, dims ~8x8x3
- Electrodo/termocupla: peso 0.05-0.1 kg, dims ~15x2x2
- Plaqueta/display: peso 0.1-0.2 kg, dims ~10x8x2
- Valvula/presostato: peso 0.2-0.5 kg, dims ~8x8x6
- Filtro deshidratador: peso 0.3-0.5 kg, dims ~15x5x5
- Accesorio (cupla, racor, tee): peso 0.1-0.3 kg, dims ~5x5x5
- Producto completo pequeno: peso 2-5 kg
- Producto completo grande: peso 10-30 kg`

function buildSystemPrompt(tnCats) {
  if (!tnCats || tnCats.length === 0) {
    return BASE_SYSTEM_PROMPT + '\n\nPara categoria_tiendanube usa la jerarquía: Repuestos y Accesorios > [Calefaccion|Refrigeracion|Gas y Agua|Agua Sanitaria|Herramientas] > [subcategoria] > [tipo]'
  }
  const catList = tnCats.map(c => {
    const parts = [c.nivel1, c.nivel2, c.nivel3, c.nivel4].filter(Boolean)
    return parts.join(' > ')
  }).filter(Boolean).join('\n')
  return BASE_SYSTEM_PROMPT + '\n\nPara categoria_tiendanube elegí la categoría más específica de esta lista:\n' + catList
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' })

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' })

  const { products, tnCategories } = req.body || {}
  if (!products || !Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No se enviaron productos' })

  const SYSTEM_PROMPT = buildSystemPrompt(tnCategories || [])

  const batch = products.slice(0, 15)
  const userPrompt = 'Productos:\n' + JSON.stringify(
    batch.map(p => ({
      codigo:    p.CODIGO    || '',
      producto:  p.PRODUCTO  || '',
      rubro:     p.RUBRO     || '',
      sub_rubro: p['SUB RUBRO'] || '',
      proveedor: p.PROVEEDOR || '',
    })),
    null, 2
  )

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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens:  4096,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        lastError = (data.error && data.error.message) ? data.error.message : JSON.stringify(data)
        if (response.status === 429 || response.status === 503) continue
        break
      }

      const content = data.choices?.[0]?.message?.content || ''
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

      let results
      try {
        results = JSON.parse(cleaned)
        if (!Array.isArray(results)) throw new Error('Not array')
      } catch (e) {
        lastError = 'Respuesta no es JSON array valido: ' + content.substring(0, 200)
        continue
      }

      return res.status(200).json({ results })

    } catch (e) {
      lastError = e.message
    }
  }

  return res.status(500).json({ error: 'Error de IA: ' + lastError })
}
