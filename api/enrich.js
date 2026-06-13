const MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]

function buildSystemPrompt(tnCats, force_nivel4 = false) {
  const catList = tnCats && tnCats.length > 0
    ? tnCats.map(c => [c.nivel1, c.nivel2, c.nivel3, c.nivel4].filter(Boolean).join(' > ')).filter(Boolean).join('\n')
    : 'Repuestos y Accesorios > Calefaccion\nRepuestos y Accesorios > Refrigeracion\nRepuestos y Accesorios > Gas y Agua\nRepuestos y Accesorios > Agua Sanitaria\nRepuestos y Accesorios > Herramientas'

  // Mapa de nivel4 existentes por nivel3 para contexto de coherencia
  const nivel4PorNivel3 = {}
  if (tnCats && tnCats.length > 0) {
    tnCats.forEach(c => {
      if (!c.nivel3 || !c.nivel4) return
      const key = `${c.nivel2} > ${c.nivel3}`
      if (!nivel4PorNivel3[key]) nivel4PorNivel3[key] = []
      if (!nivel4PorNivel3[key].includes(c.nivel4)) nivel4PorNivel3[key].push(c.nivel4)
    })
  }
  const nivel4Contexto = Object.entries(nivel4PorNivel3)
    .map(([k, v]) => `${k}: ${v.join(' | ')}`)
    .join('\n')

  const forceNivel4Block = force_nivel4
    ? '\nATENCIÓN: Para TODOS los productos de esta lista, el path de categoría llega solo hasta nivel3. DEBES agregar un nivel4 específico y coherente con los existentes en ese nivel3. No devolver paths sin nivel4.\n'
    : ''

  const ESTRUCTURA_REFERENCIA = `ESTRUCTURA DE CATEGORÍAS (referencia de estilo para nivel4):
Calefacción > Calderas: Plaquetas y Electrónica | Hidráulicos | Quemadores y Encendido | Sensores y Presostatos | Válvulas y Gas
Calefacción > Calefones: Diafragmas y Membranas | Termocuplas y Pilotos | Unidades Magnéticas
Calefacción > Calefactores: Termocuplas y Pilotos | Válvulas y Gas | Repuestos Generales
Calefacción > Radiadores: Válvulas y Detentores | Accesorios
Calefacción > Piso Radiante: Membranas y Tubería
Calefacción > Salamandras: Conductos Enlozados | Repuestos Generales
Agua Sanitaria > Termotanques: Resistencias y Ánodos | Termostatos y Válvulas
Agua Sanitaria > Calefones: Diafragmas y Membranas | Termocuplas y Pilotos | Unidades Magnéticas
Agua Sanitaria > Filtros de Agua: Cartuchos y Membranas | Vasos y Filtros Completos
Refrigeración > Válvulas y Filtros: Filtros Deshidratadores | Válvulas Solenoides | Accesorios Refrigeración
Refrigeración > Gas Refrigerante: R22 / R134 / R410 / R404
Refrigeración > Compresores y Motores: Motores Forzadores | Comandos y Controles | Capacitores y Contactores
Materiales Eléctricos > Cables: Cables Calefactor | Cables Encendido
Materiales Eléctricos > Fichas y Conectores: Fichas y Enchufes | Conectores Específicos
Materiales Eléctricos > Sensores: Sensores de Llama | Sensores de Temperatura
Materiales de Instalación > Manómetros: Manómetros de Gas | Manómetros de Refrigeración
Materiales de Instalación > Válvulas de Gas: Llaves y Válvulas Esféricas | Electroválvulas
Materiales de Instalación > Válvulas de Agua: Válvulas de Retención | Válvulas de Alivio | Detentores
Materiales de Instalación > Protección Eléctrica: Interruptores y Térmicas | Guardamotores | Relays de Protección
Materiales de Instalación > Termostatos Ambiente: (sin nivel4 todavía)`

  return `Sos un experto en repuestos HVAC (calefacción, refrigeración, gas, agua sanitaria) para el mercado argentino. Completá los datos de cada producto para una tienda online en Tienda Nube.
${forceNivel4Block}
CATEGORÍAS DISPONIBLES — LISTA COMPLETA Y DEFINITIVA:
${catList}

${ESTRUCTURA_REFERENCIA}

⛔ REGLAS ABSOLUTAS — NUNCA violar:
1. NUNCA crear nivel1, nivel2 ni nivel3 nuevos
2. NUNCA devolver una categoría que no esté en la lista de CATEGORÍAS DISPONIBLES
3. Si el producto encaja en una categoría existente → usarla EXACTAMENTE
4. Solo marcar es_categoria_nueva: true si el producto claramente necesita un nivel4 que no existe en su nivel3

✅ CUÁNDO crear nivel4 nuevo (es_categoria_nueva: true):
- El nivel3 correcto existe pero ningún nivel4 describe bien el producto
- El nivel4 nuevo es genérico (aplica a varios productos similares)
- Sigue el mismo estilo que los nivel4 existentes en ese nivel3
- Máximo 4 palabras en español
- Ejemplo válido: nivel3 "Calderas" no tiene nivel4 para "motores" → sugerir "Motores y Ventiladores"

❌ CUÁNDO NO crear nivel4 nuevo:
- Ya existe un nivel4 que describe bien el producto (aunque no sea perfecto)
- El nombre sería demasiado específico (solo aplica a 1 producto)
- Implicaría crear un nivel3 nuevo primero
- Hay más de 4 palabras en el nombre

EN CASO DE DUDA: usar la categoría existente más cercana.

Si sugerís nivel4 nuevo:
  "es_categoria_nueva": true,
  "keywords_sugeridas": "keyword1,keyword2,keyword3"

Si usás categoría existente:
  "es_categoria_nueva": false,
  "keywords_sugeridas": null

Para cada producto devolvé SOLO un JSON array válido sin markdown ni backticks.
Formato exacto por producto:
{
  "codigo": "código del producto",
  "slug": "nombre-en-minusculas-sin-acentos-con-guiones",
  "nombre_limpio": "Nombre capitalizado correctamente. Expandir abreviaciones: REP.→Repuesto, UM→Unidad Magnética, ACC.→Accesorio, CALD.→Caldera, CALEF.→Calefón",
  "marca": "Marca del producto extraída del nombre o proveedor. Solo la marca fabricante, no la marca compatible",
  "prop1_nombre": "Marca compatible",
  "prop1_valor": "Marcas separadas por / extraídas del nombre, o null si no hay info",
  "prop2_nombre": "Medida o Capacidad o null",
  "prop2_valor": "Valor con unidad (ej: 76mm, 14/16 litros, 10 gramos) o null",
  "prop3_nombre": "Tipo o Modelo o Conexión o null",
  "prop3_valor": "Valor específico (ej: Botonera grande, 3/4 M-H, Target) o null",
  "descripcion_html": "<p>Descripción en 2-3 oraciones en español rioplatense. Qué es, para qué sirve, con qué equipos es compatible.</p><hr/><h3>Especificaciones técnicas</h3><ul><li><p>Compatible con: [marcas/modelos]</p></li><li><p>Tipo: [tipo de repuesto]</p></li><li><p>Material: [si se puede inferir]</p></li></ul>",
  "tags": ["tag1", "tag2", "tag3"],
  "seo_titulo": "Nombre Producto | Categoría | Marca (máx 70 caracteres)",
  "seo_descripcion": "Descripción breve para SEO máx 160 caracteres",
  "peso_kg": número estimado,
  "alto_cm": número estimado,
  "ancho_cm": número estimado,
  "profundidad_cm": número estimado,
  "categoria_tiendanube": "Copiar exactamente de la lista de categorías disponibles",
  "es_categoria_nueva": false,
  "keywords_sugeridas": null
}

REGLAS PARA LAS PROPIEDADES:

PROPIEDAD 1 — Marca compatible:
- prop1_nombre: siempre "Marca compatible" (nunca null si hay marcas identificables)
- prop1_valor: marcas compatibles separadas por " / " en el nombre del producto
- Ejemplos:
  "DIAFRAGMA CALEFON ORBIS BOTONERA GRANDE" → prop1_valor: "Orbis"
  "UNIDAD MAGNETICA UM11 FASTON (ORBIS, LONGVIE, DOMEC)" → prop1_valor: "Orbis / Longvie / Domec"
  "TERMOCUPLA SIT INTERROTTA LUNA ECO SOLARIA" → prop1_valor: "Baxi / Luna / Solaria"
  Sin marca → prop1_nombre: null, prop1_valor: null

PROPIEDAD 2 — Medida o Capacidad:
- prop2_nombre: "Medida" (para dimensiones/mm/cm) o "Capacidad" (para litros/gramos)
- prop2_valor: valor con unidad extraído del nombre
- Ejemplos:
  "DIAFRAGMA CALEFON ORBIS BOTONERA GRANDE (76MM)" → "Medida", "76mm"
  "DIAFRAGMA CALEFON ORBIS 14/16 LTS" → "Capacidad", "14/16 litros"
  "FILTRO O CHICOTE DE 10 GRAMOS" → "Capacidad", "10 gramos"
  "ANODO 65CM" → "Medida", "65cm"
  Sin medida → prop2_nombre: null, prop2_valor: null

PROPIEDAD 3 — Tipo, Modelo o Conexión:
- prop3_nombre: "Tipo" o "Modelo" o "Conexión" según corresponda
- Ejemplos:
  "DIAFRAGMA CALEFON ORBIS BOTONERA GRANDE" → "Tipo", "Botonera grande"
  "LLAVE DE GAS DE 3/4 M-H BRONCE FV" → "Conexión", "3/4 M-H"
  "TERMOCUPLA 300MM PARA PILOTO TARGET" → "Modelo", "Target / Coppens"
  Sin tipo/modelo → prop3_nombre: null, prop3_valor: null

ESTIMACIONES DE PESO Y DIMENSIONES:
- Diafragma/membrana: 0.1-0.3 kg, 8x8x3 cm
- Electrodo/termocupla fina: 0.05-0.1 kg, 15x2x2 cm
- Termocupla con cable: 0.1-0.2 kg, 20x3x3 cm
- Plaqueta/display: 0.1-0.3 kg, 15x10x3 cm
- Válvula/presostato pequeño: 0.2-0.4 kg, 8x8x6 cm
- Válvula gas grande: 0.5-1 kg, 12x10x8 cm
- Unidad magnética: 0.2-0.5 kg, 10x8x6 cm
- Filtro deshidratador: 0.3-0.5 kg, 15x5x5 cm
- Resistencia termotanque: 0.3-0.6 kg, 40x5x5 cm
- Ánodo magnesio: 0.4-0.8 kg, 65x3x3 cm
- Capacitor pequeño: 0.1-0.2 kg, 8x4x4 cm
- Manómetro: 0.2-0.4 kg, 12x12x8 cm
- Motor ventilador: 0.5-1.5 kg, 15x15x12 cm
- Accesorio (cupla, racor, tee): 0.1-0.3 kg, 5x5x5 cm
- Producto completo pequeño: 2-5 kg
- Producto completo grande: 10-30 kg

ABREVIACIONES HVAC ARGENTINA:
UM→Unidad Magnética | TF→Tiro Forzado | TN→Tiro Natural | M-H→Macho-Hembra | F-F→Femenino-Femenino | BSP/NPT→rosca | MM→milímetros | FASTON→conector eléctrico | NTC/PTC→sensor temperatura

Recordá: categoria_tiendanube debe ser SIEMPRE el path completo de 4 niveles copiado exactamente de la lista.`
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

  const count = Array.isArray(req.body?.products) ? req.body.products.length : 0
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API) {
    console.log('[enrich] POST', count, 'products')
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' })

  const { products, tnCategories, force_nivel4 = false } = req.body || {}
  if (!products || !Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No se enviaron productos' })

  const tnCats = tnCategories || []
  console.log('[enrich] tnCategories recibidas:', tnCats.length)
  console.log('[enrich] Primeras 3:', tnCats.slice(0, 3).map(c => c.nivel4 || c.nivel3))

  const SYSTEM_PROMPT = buildSystemPrompt(tnCats, force_nivel4)

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

      // ── Validar y corregir categorías devueltas por Groq ─────────────────────
      if (tnCats.length > 0) {
        const validPaths = new Set(
          tnCats.map(c =>
            [c.nivel1, c.nivel2, c.nivel3, c.nivel4].filter(Boolean).join(' > ').toLowerCase().trim()
          )
        )
        const validPaths3 = new Set(
          tnCats.map(c =>
            [c.nivel1, c.nivel2, c.nivel3].filter(Boolean).join(' > ').toLowerCase().trim()
          )
        )

        results = results.map(r => {
          if (!r.categoria_tiendanube) return r

          // Validar es_categoria_nueva antes de procesar el path
          if (r.es_categoria_nueva) {
            const parts = r.categoria_tiendanube.split(' > ').map(p => p.trim())
            if (parts.length !== 4) {
              r = { ...r, es_categoria_nueva: false, keywords_sugeridas: null }
            } else {
              const nivel3Existe = tnCats.some(c =>
                c.nivel1?.trim() === parts[0] &&
                c.nivel2?.trim() === parts[1] &&
                c.nivel3?.trim() === parts[2]
              )
              if (!nivel3Existe) {
                r = { ...r, es_categoria_nueva: false, keywords_sugeridas: null }
              } else {
                const nivel4Existe = tnCats.some(c =>
                  c.nivel1?.trim() === parts[0] &&
                  c.nivel2?.trim() === parts[1] &&
                  c.nivel3?.trim() === parts[2] &&
                  c.nivel4?.trim().toLowerCase() === parts[3].toLowerCase()
                )
                if (nivel4Existe) {
                  r = { ...r, es_categoria_nueva: false, keywords_sugeridas: null }
                }
              }
            }
          }

          const catLower = r.categoria_tiendanube.toLowerCase().trim()

          if (validPaths.has(catLower)) return r

          if (validPaths3.has(catLower)) {
            return { ...r, es_categoria_incompleta: true }
          }

          const nombreProducto = (r.nombre_limpio || r.codigo || '').toLowerCase()
          let bestMatch = null
          let bestScore = 0
          tnCats.forEach(cat => {
            if (!cat.keywords) return
            const kws = cat.keywords.split(',').map(k => k.trim().toLowerCase())
            const score = kws.filter(kw => kw && nombreProducto.includes(kw)).length
            if (score > bestScore) { bestScore = score; bestMatch = cat }
          })

          if (bestMatch && bestScore > 0) {
            const correctedPath = [bestMatch.nivel1, bestMatch.nivel2, bestMatch.nivel3, bestMatch.nivel4]
              .filter(Boolean).join(' > ')
            console.log(`[enrich] Corregida: "${r.categoria_tiendanube}" → "${correctedPath}"`)
            return { ...r, categoria_tiendanube: correctedPath, es_categoria_nueva: false, categoria_corregida: true }
          }

          console.log(`[enrich] Sin match: "${r.categoria_tiendanube}" — usando fallback`)
          return { ...r, categoria_tiendanube: 'Repuestos y Accesorios', es_categoria_nueva: false }
        })
      }

      return res.status(200).json({ results })

    } catch (e) {
      lastError = e.message
    }
  }

  return res.status(500).json({ error: 'Error de IA: ' + lastError })
}
