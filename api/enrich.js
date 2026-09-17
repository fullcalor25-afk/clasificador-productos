import { supabaseQuery } from './_helpers.js'

const MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
]

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Fallback mínimo si la tabla `marcas` todavía no existe o Supabase no responde.
// NO es la fuente de verdad — esa es la tabla `marcas` (ver supabase_marcas.sql).
// Existe sólo para que el prompt no se quede sin ninguna pista de marca, igual
// que DEFAULT_RULES en src/constants.js cubre una tabla de reglas vacía.
const DEFAULT_MARCAS = [
  { slug: 'baxi',     nombre: 'Baxi',     tipo: 'marca_equipo', categoria_nivel3: 'Calderas',  categoria_forzada: null, alias: [] },
  { slug: 'orbis',    nombre: 'Orbis',    tipo: 'marca_equipo', categoria_nivel3: 'Calefones', categoria_forzada: null, alias: [] },
  { slug: 'longvie',  nombre: 'Longvie',  tipo: 'marca_equipo', categoria_nivel3: 'Calefones', categoria_forzada: null, alias: [] },
]

function slugifyMarca(text) {
  return (text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Match por palabra completa para no disparar con coincidencias parciales
// (ej. "york" dentro de otra palabra).
function textoMencionaMarca(texto, marca) {
  const candidatos = [marca.nombre, ...(marca.alias || [])].filter(Boolean)
  return candidatos.some(c => {
    try {
      return new RegExp(`(^|[^a-záéíóúñ0-9])${escapeRegExp(c.toLowerCase())}([^a-záéíóúñ0-9]|$)`, 'i').test(texto)
    } catch {
      return texto.includes(c.toLowerCase())
    }
  })
}

// Normaliza la marca detectada al slug canónico de la tabla, para que no
// convivan "immergas" / "Immergas" / "inmergas" como cosas distintas.
function normalizarMarca(textoDetectado, marcas) {
  const t = (textoDetectado || '').toLowerCase().trim()
  if (!t) return ''
  const match = marcas.find(m =>
    m.nombre.toLowerCase() === t || (m.alias || []).some(a => a.toLowerCase() === t)
  )
  return match ? match.slug : slugifyMarca(textoDetectado)
}

function buildSystemPrompt(tnCats, marcas, force_nivel4 = false) {
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

  // ── Listas de marcas armadas desde la tabla `marcas` (no hardcodeadas) ──
  const marcasEquipo = marcas.filter(m => m.tipo === 'marca_equipo')
  const marcasFabricante = marcas.filter(m => m.tipo === 'fabricante_componente')

  const marcasEquipoStr = marcasEquipo.map(m => m.nombre).join(', ') || '(sin marcas cargadas)'
  const marcasFabricanteStr = marcasFabricante.map(m => m.nombre).join(', ') || '(sin fabricantes cargados)'

  // Agrupadas por el nivel3 donde suelen aparecer — reemplaza la lista de
  // "Proveedores de X: ..." que antes estaba escrita a mano.
  const porNivel3 = {}
  marcasEquipo.forEach(m => {
    if (!m.categoria_nivel3) return
    if (!porNivel3[m.categoria_nivel3]) porNivel3[m.categoria_nivel3] = []
    porNivel3[m.categoria_nivel3].push(m.nombre)
  })
  const marcasPorNivel3Str = Object.entries(porNivel3)
    .map(([nivel3, nombres]) => `   - Marcas típicas de ${nivel3}: ${nombres.join(', ')}`)
    .join('\n') || '   - (sin marcas cargadas en la tabla marcas)'

  // Marcas con categoría forzada: el prompt las menciona, pero la regla real
  // se aplica en código después de la respuesta de la IA (ver handler).
  const marcasForzadas = marcas.filter(m => m.categoria_forzada)
  const marcasForzadasStr = marcasForzadas.map(m => m.nombre).join(', ')
  const bloqueForzadas = marcasForzadas.length > 0
    ? `
5. CASOS ESPECIALES — calefactores de aire forzado (furnace), NO son calderas hidrónicas:
   - Marcas: ${marcasForzadasStr}
   - Si el nombre menciona alguna de estas marcas, o dice "calefactor de aire", "aire forzado", "furnace", "caldera de aire" → la categoría NUNCA es "Calefacción > Calderas". Usar la categoría de calefactores correspondiente de la lista disponible.
   - En este caso, dentro de compatibilidad usar "calefactor de aire forzado" como tipo de equipo, no "caldera".
   - Línea "CALDAIA" + "TOP"/"GENIUS" (ej. "MONOPLAQUETA TOP-2023 CALDAIA", "DISPLAY TOP GENIUS CALDAIA") → SÍ es una placa de caldera hidrónica, marca "Caldaia" (fabricante italiano de controles para calderas murales). No confundir con los casos de furnace de arriba.
`
    : ''

  const forceNivel4Block = force_nivel4
    ? '\nATENCIÓN: Para TODOS los productos de esta lista, el path de categoría llega solo hasta nivel3. DEBES agregar un nivel4 específico y coherente con los existentes en ese nivel3. No devolver paths sin nivel4.\n'
    : ''

  const ESTRUCTURA_REFERENCIA = `ESTRUCTURA DE CATEGORÍAS (referencia de estilo para nivel4):
Calefacción > Calderas: Plaquetas y Electrónica | Hidráulicos | Quemadores y Encendido | Sensores y Presostatos | Válvulas y Gas | Manómetros
Calefacción > Calefactores: Termocuplas y Pilotos | Válvulas y Gas | Repuestos Generales
Calefacción > Radiadores: Válvulas y Detentores | Accesorios
Calefacción > Piso Radiante: Membranas y Tubería
Calefacción > Salamandras: Conductos Enlozados | Repuestos Generales | Vidrios y Juntas | Refractarios y Deflectores
Calefacción > Estufas a Pellet: Resistencias de Encendido | Motores y Forzadores | Sensores y Placas | Vidrios y Juntas
Calefacción > Bombas y Presurizadoras: Sellos y Capacitores | Presostatos y Membranas | Impulsores y Kits
Agua Sanitaria > Termotanques: Resistencias y Ánodos | Termostatos y Válvulas
Agua Sanitaria > Calefones: Diafragmas y Membranas | Termocuplas y Pilotos | Unidades Magnéticas
Agua Sanitaria > Filtros de Agua: Cartuchos y Membranas | Vasos y Filtros Completos
Refrigeración > Válvulas y Filtros: Filtros Deshidratadores | Válvulas Solenoides | Accesorios Refrigeración | Manómetros
Refrigeración > Gas Refrigerante: R22 / R134 / R410 / R404
Refrigeración > Compresores y Motores: Motores Forzadores | Comandos y Controles | Capacitores y Contactores
Materiales Eléctricos > Cables: Cables Calefactor | Cables Encendido
Materiales Eléctricos > Fichas y Conectores: Fichas y Enchufes | Conectores Específicos
Materiales de Instalación > Válvulas de Gas: Llaves y Válvulas Esféricas | Electroválvulas
Materiales de Instalación > Válvulas de Agua: Válvulas de Retención | Válvulas de Alivio | Detentores
Materiales de Instalación > Protección Eléctrica: Interruptores y Térmicas | Guardamotores | Relays de Protección
Materiales de Instalación > Termostatos Ambiente: (sin nivel4 todavía)`

  return `Sos un experto en repuestos HVAC (calefacción, refrigeración, gas, agua sanitaria) para el mercado argentino. Completá los datos de cada producto para una tienda online en Tienda Nube.
${forceNivel4Block}
CÓMO ANALIZAR CADA PRODUCTO para asignar categoría:

1. NOMBRE DEL PRODUCTO — es la fuente principal:
   - Buscar el tipo de repuesto: diafragma, electrodo, termocupla, etc.
   - Buscar la marca del equipo: ${marcasEquipoStr}
   - Fabricantes de componentes (placas, sensores, válvulas de terceros): ${marcasFabricanteStr}
   - Buscar códigos de fabricante: BTG12, NTC10K, SIT820, etc.
   - Buscar el equipo compatible: "PARA CALDERA", "PARA CALEFON", etc.

2. RUBRO y SUB RUBRO — clasificación del sistema de gestión:
   - "CALDERAS" / "ACC. CALDERAS" → Calefacción > Calderas
   - "REP. CALEFACCION" / "DIAFRAGMA" → Agua Sanitaria > Calefones
   - "CLIMATIZACION" / "TERMOSTATO" → Materiales de Instalación > Termostatos Ambiente
   - "REFRIGERACION Y AIRE ACONDICIONADO" → Refrigeración
   - "GAS" / "VALVULAS Y LLAVES" → Materiales de Instalación > Válvulas de Gas
   - "FILTROS DE AGUA" → Agua Sanitaria > Filtros de Agua
   - "MATERIALES ELECTRICOS" → Materiales Eléctricos

3. PROVEEDOR — da pistas de la marca y tipo:
${marcasPorNivel3Str}

4. CÓDIGOS ESPECÍFICOS que identifican el producto:
   - BTG12 → electrodo de encendido (Calderas > Quemadores y Encendido)
   - SIT / HONEYWELL → válvulas de gas o presostatos
   - NTC / PTC / PT100 → sensores de temperatura (Calderas > Sensores y Presostatos)
   - UM + número → Unidad Magnética para calefón (Agua Sanitaria > Calefones)
   - DKG / LGB → control de llama (Calderas > Sensores y Presostatos)
   - MUF / FAN INDUCER → motor forzador (Refrigeración > Compresores y Motores)

${bloqueForzadas}
Usá TODA esta información combinada para elegir la categoría más específica y correcta de la lista disponible.

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

REGLAS PARA TAGS ESTRUCTURADOS (van DENTRO del array "tags", sumados a las palabras libres):
- equipo:<tipo> — ej. "equipo:caldera", "equipo:calefon", "equipo:estufa-pellet", "equipo:bomba"
  Para calefactores de aire forzado (Goodman y similares) usar "equipo:calefactor-aire-forzado", nunca "equipo:caldera".
- marca:<marca-equipo> — la marca del EQUIPO compatible (ej. "marca:immergas"), una entrada por marca si hay varias
- modelo:<modelo> — un tag por modelo compatible (ej. "modelo:eolo-star", "modelo:nike-star"), repetible
- fabricante:<fabricante> — SOLO cuando el repuesto en sí (placa, sensor, válvula) es fabricado por un tercero distinto de la marca del equipo (ej. una placa Immergas con componente Surrey/Honeywell/Zettler → "fabricante:surrey"). Si la marca del equipo y el fabricante del repuesto son la misma, no repetir el tag.
- pieza:<tipo-de-pieza> — ej. "pieza:placa-electronica", "pieza:vaso-expansion", "pieza:forzador"
- medida:<medida> — solo si hay medida física relevante para búsqueda (ej. "medida:3-4", "medida:76mm")
- oem:<codigo> — código de fabricante/OEM tal cual figura en el producto (ej. "oem:btg12"), uno por código
- Si un dato no aplica o no se puede inferir con confianza, omitir ese tag — nunca inventar marca, modelo u OEM.
- Todos en minúsculas, sin acentos, guiones en vez de espacios (mismo criterio que "slug").

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

  const userKey = req.headers['x-groq-key']
  const apiKey = (typeof userKey === 'string' && userKey.trim()) ? userKey.trim() : process.env.GROQ_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY no configurada' })

  const { products, tnCategories, force_nivel4 = false } = req.body || {}
  if (!products || !Array.isArray(products) || products.length === 0)
    return res.status(400).json({ error: 'No se enviaron productos' })

  const tnCats = tnCategories || []
  console.log('[enrich] tnCategories recibidas:', tnCats.length)
  console.log('[enrich] Primeras 3:', tnCats.slice(0, 3).map(c => c.nivel4 || c.nivel3))

  // Las marcas se leen server-side (no del body) porque categoria_forzada es una
  // regla de negocio: tiene que aplicarse siempre, sin depender de lo que mande
  // el cliente ni de que la IA respete una instrucción de texto.
  let marcas = []
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const data = await supabaseQuery(
        '/rest/v1/marcas?select=slug,nombre,tipo,categoria_nivel3,categoria_forzada,alias&activa=eq.true',
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      if (Array.isArray(data)) marcas = data
    } catch (e) {
      console.warn('[enrich] No se pudieron cargar marcas de Supabase:', e.message)
    }
  }
  if (marcas.length === 0) {
    console.warn('[enrich] Tabla marcas vacía o no disponible — usando DEFAULT_MARCAS')
    marcas = DEFAULT_MARCAS
  }
  console.log('[enrich] marcas cargadas:', marcas.length)

  const SYSTEM_PROMPT = buildSystemPrompt(tnCats, marcas, force_nivel4)

  const batch = products.slice(0, 15)
  const userPrompt = 'Productos:\n' + JSON.stringify(
    batch.map(p => ({
      codigo:        p.CODIGO        || p.codigo        || '',
      producto:      p.PRODUCTO      || p.producto      || '',
      rubro:         p.RUBRO         || p.rubro         || '',
      sub_rubro:     p['SUB RUBRO']  || p.sub_rubro     || '',
      proveedor:     p.PROVEEDOR     || p.proveedor     || '',
      clasificacion: p._class?.classification || p.clasificacion || '',
    })),
    null, 2
  )

  let lastError = 'Error desconocido'
  const attemptCounts = {}
  const MAX_ATTEMPTS_PER_MODEL = 2

  for (let m = 0; m < MODELS.length; m++) {
    const model = MODELS[m]
    attemptCounts[m] = (attemptCounts[m] || 0) + 1
    console.log('Intentando modelo Groq:', model, '- intento', attemptCounts[m])
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
        if (response.status === 429 || response.status === 503) {
          if (attemptCounts[m] < MAX_ATTEMPTS_PER_MODEL) {
            const backoff = 6000
            console.log(`[enrich] Rate limit en ${model}, esperando ${backoff}ms antes de reintentar (intento ${attemptCounts[m]}/${MAX_ATTEMPTS_PER_MODEL})`)
            await wait(backoff)
            m--
          }
          continue
        }
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

      // ── Normalizar marca al slug canónico de la tabla `marcas` ───────────────
      results = results.map(r => (
        r.marca ? { ...r, marca_slug: normalizarMarca(r.marca, marcas) } : r
      ))

      // ── Categoría forzada por marca — regla de negocio, no sugerencia ────────
      // Si el producto menciona una marca con categoria_forzada, se aplica sin
      // importar lo que haya devuelto la IA. Corre ANTES de la validación de
      // categorías, así el path forzado pasa por el mismo chequeo que el resto.
      const marcasConForzada = marcas.filter(m => m.categoria_forzada)
      if (marcasConForzada.length > 0) {
        // El nombre original del producto es más confiable que el nombre_limpio
        // de la IA para detectar la marca, así que se busca en ambos.
        const textoOriginalPorCodigo = {}
        batch.forEach(p => {
          const cod = String(p.CODIGO || p.codigo || '').toLowerCase()
          if (!cod) return
          textoOriginalPorCodigo[cod] = [
            p.PRODUCTO || p.producto || '',
            p.PROVEEDOR || p.proveedor || '',
          ].join(' ').toLowerCase()
        })

        results = results.map(r => {
          const texto = [
            r.nombre_limpio || '',
            textoOriginalPorCodigo[String(r.codigo || '').toLowerCase()] || '',
          ].join(' ').toLowerCase()
          if (!texto.trim()) return r

          const marcaForzada = marcasConForzada.find(m => textoMencionaMarca(texto, m))
          if (!marcaForzada) return r

          if (r.categoria_tiendanube !== marcaForzada.categoria_forzada) {
            console.log(`[enrich] Categoría forzada por marca "${marcaForzada.slug}": "${r.categoria_tiendanube}" → "${marcaForzada.categoria_forzada}"`)
          }
          return {
            ...r,
            categoria_tiendanube: marcaForzada.categoria_forzada,
            es_categoria_nueva: false,
            keywords_sugeridas: null,
            categoria_forzada_por: marcaForzada.slug,
          }
        })
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

          // Una categoría forzada por marca no se re-evalúa: es regla de negocio.
          // Si el path no existe en tiendanube_categories avisamos fuerte, porque
          // significa que el dato de `marcas.categoria_forzada` quedó desalineado.
          if (r.categoria_forzada_por) {
            if (!validPaths.has(r.categoria_tiendanube.toLowerCase().trim())) {
              console.error(`[enrich] categoria_forzada de "${r.categoria_forzada_por}" NO existe en tiendanube_categories: "${r.categoria_tiendanube}" — revisar la tabla marcas`)
            }
            return r
          }

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
