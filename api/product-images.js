// Fotos de placas/etiquetas de producto + OCR con modelo de visión (spec v6).
//
// La imagen NO pasa por acá: el celular la sube directo a Supabase Storage y
// esta función solo recibe la URL pública ya subida. Eso evita el límite de
// ~4.5MB de body de las Vercel Functions contra fotos de iPhone sin comprimir.
//
// Regla de base: la IA transcribe, el usuario confirma. Nada queda como dato
// final sin el PATCH de confirmación.

import { logRequest, supabaseQuery } from './_helpers.js'

// Los IDs se verifican contra los docs/API en vivo al implementar, no de memoria.
// Gemini (proveedor por defecto): ai.google.dev/gemini-api/docs/models
const GEMINI_MODEL = 'gemini-3.8-flash'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
// Groq: los modelos de visión llama-4 fueron deprecados en 2026; el sustituto
// multimodal es qwen3.6-27b (Preview). Verificar con GET /openai/v1/models.
// Ya van dos deprecaciones de visión en Groq en poco tiempo: asumir que esta
// pieza se puede caer de nuevo, y por eso los errores dicen de qué proveedor son.
const GROQ_MODEL = 'qwen/qwen3.6-27b'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Gemini acepta ~20MB de request inline y base64 infla ~33%, así que el archivo
// crudo no puede pasar de ~14MB. Una foto de iPhone son 3-5MB; el bucket admite
// hasta 25MB, así que el caso existe aunque en la práctica no se toque.
const GEMINI_MAX_BYTES = 14 * 1024 * 1024

const BUCKET = 'producto-fotos'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-groq-key')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
}

// ── Prompt anti-alucinación ──────────────────────────────────────────────────
// Es el punto más importante de toda la spec: se copia textual y no se
// reescribe "para mejorarlo". Preferimos un dato incompleto a uno incorrecto.
const OCR_PROMPT = `Sos un asistente que transcribe texto de fotos de placas/repuestos de equipos
de calefacción, refrigeración y agua sanitaria. Mirá la imagen y devolvé SOLO
un JSON:

{
  "codigo_principal": "el código de fabricante más prominente y legible en la imagen, o null si no hay ninguno legible con certeza",
  "otros_codigos": ["cualquier otro código/número de serie visible, cada uno como string separado"],
  "texto_completo": "todo el texto legible en la imagen, tal cual aparece, sin corregir ni interpretar",
  "modelos_mencionados": ["cualquier modelo de equipo o caldera que aparezca impreso, si lo hay — vacío si no hay ninguno"],
  "confianza": "alta / media / baja",
  "advertencia": "si la foto está borrosa, mal iluminada, el código está parcialmente tapado, o hay CUALQUIER duda sobre la lectura, describilo acá en una frase corta. Si no hay ningún problema, null."
}

REGLA ABSOLUTA: si no podés leer un carácter con certeza, no lo adivines ni
lo completes por contexto. Marcalo como no legible (usando "?" en el lugar
del carácter dudoso, o directamente confianza "baja") antes que inventar un
dígito o letra que no ves con claridad. Es preferible un dato incompleto que
un dato incorrecto.`

function parseOcrJson(raw) {
  if (!raw) throw new Error('El modelo no devolvió texto')
  // Algunos modelos envuelven el JSON en un bloque de código
  let txt = raw.trim()
  if (txt.startsWith('```')) {
    txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  const start = txt.indexOf('{')
  const end = txt.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('El modelo no devolvió un JSON válido')
  const parsed = JSON.parse(txt.slice(start, end + 1))

  return {
    codigo_principal: parsed.codigo_principal ?? null,
    otros_codigos: Array.isArray(parsed.otros_codigos) ? parsed.otros_codigos : [],
    texto_completo: parsed.texto_completo || '',
    modelos_mencionados: Array.isArray(parsed.modelos_mencionados) ? parsed.modelos_mencionados : [],
    confianza: parsed.confianza || 'baja',
    advertencia: parsed.advertencia || null,
  }
}

// A diferencia de Groq, Gemini no descarga URLs arbitrarias: hay que bajar la
// imagen del Storage público y mandarla inline en base64.
async function ocrConGemini(url, apiKey) {
  const img = await fetch(url)
  if (!img.ok) throw new Error('No se pudo descargar la foto desde Storage (' + img.status + ')')

  const buf = Buffer.from(await img.arrayBuffer())
  if (buf.length > GEMINI_MAX_BYTES) {
    throw new Error('La foto es demasiado grande para Gemini (' + Math.round(buf.length / 1048576) + 'MB). Sacala de nuevo con menos resolución.')
  }
  const mimeType = img.headers.get('content-type') || 'image/jpeg'

  const r = await fetch(
    GEMINI_URL + '/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mimeType, data: buf.toString('base64') } },
              { text: OCR_PROMPT },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error('[product-images gemini]', r.status, txt.substring(0, 300))
    if (r.status === 401 || r.status === 403) {
      throw Object.assign(new Error('Gemini API key invalida o sin permisos'), { status: 401 })
    }
    throw new Error('Error del modelo de vision de Gemini (' + r.status + ')')
  }

  const data = await r.json()
  const texto = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text)
    .filter(Boolean)
    .join('\n')
  return parseOcrJson(texto)
}

// Se manda UNA sola imagen por request (una foto = una llamada), así que el caso
// de "demasiadas imágenes" que la doc de Groq describe de forma inconsistente no
// se puede dar acá. No hace falta degradar nada.
async function ocrConGroq(url, apiKey) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.1,
      max_tokens: 2048,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url } },
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
    }),
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error('[product-images groq]', r.status, txt.substring(0, 300))
    if (r.status === 401) throw Object.assign(new Error('Groq API key invalida'), { status: 401 })
    throw new Error('Error del modelo de vision de Groq (' + r.status + ')')
  }

  const data = await r.json()
  return parseOcrJson(data?.choices?.[0]?.message?.content)
}

// El path dentro del bucket sale de la URL pública guardada
function storagePathDesdeUrl(url) {
  const marker = '/storage/v1/object/public/' + BUCKET + '/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  return url.slice(i + marker.length)
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_KEY
  if (!SUPABASE_URL || !SUPABASE_KEY)
    return res.status(500).json({ error: 'Variables de Supabase no configuradas' })

  const TABLE = '/rest/v1/producto_imagenes'

  // ── GET ?codigo=X  |  ?codigos=a,b,c ───────────────────────────────────────
  if (req.method === 'GET') {
    const { codigo, codigos } = req.query || {}
    try {
      let filtro = ''
      if (codigos) {
        const lista = String(codigos)
          .split(',')
          .map(c => c.trim())
          .filter(Boolean)
        if (!lista.length) return res.status(200).json([])
        // PostgREST: in.("a","b") — las comillas permiten códigos con comas o espacios
        const inList = lista.map(c => '"' + c.replace(/"/g, '\\"') + '"').join(',')
        filtro = '&codigo=in.(' + encodeURIComponent(inList) + ')'
      } else if (codigo) {
        filtro = '&codigo=eq.' + encodeURIComponent(codigo)
      } else {
        return res.status(400).json({ error: 'Falta codigo o codigos' })
      }

      const data = await supabaseQuery(
        TABLE + '?select=*' + filtro + '&order=created_at.asc',
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      return res.status(200).json(data || [])
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // ── POST { codigo, url, provider } → OCR + insert ──────────────────────────
  if (req.method === 'POST') {
    const body = req.body
    if (!body) return res.status(400).json({ error: 'Request invalido' })

    const codigo = (body.codigo || '').trim()
    const url = (body.url || '').trim()
    const provider = body.provider === 'groq' ? 'groq' : 'gemini'
    const otro = provider === 'groq' ? 'gemini' : 'groq'
    if (!codigo) return res.status(400).json({ error: 'Falta el codigo del producto' })
    if (!url) return res.status(400).json({ error: 'Falta la URL de la imagen' })

    logRequest('product-images', { codigo, provider })

    let ocr
    try {
      if (provider === 'groq') {
        const userKey = req.headers['x-groq-key']
        const apiKey = (typeof userKey === 'string' && userKey.trim()) ? userKey.trim() : process.env.GROQ_API_KEY
        if (!apiKey) {
          return res.status(500).json({ error: 'GROQ_API_KEY no configurada', provider_fallo: 'groq', otro_proveedor: otro })
        }
        ocr = await ocrConGroq(url, apiKey)
      } else {
        // La key de Gemini es solo server-side: no se acepta override por header
        // ni se guarda en el browser, a diferencia de la de Groq.
        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) {
          return res.status(500).json({ error: 'GEMINI_API_KEY no configurada', provider_fallo: 'gemini', otro_proveedor: otro })
        }
        ocr = await ocrConGemini(url, apiKey)
      }
    } catch (e) {
      console.error('[product-images ocr]', e.message)
      // Se informa QUÉ proveedor falló para que la UI pueda ofrecer el otro, en
      // vez de dejar al usuario sin poder cargar la foto. Con dos deprecaciones
      // de visión en Groq en un año, esto no es hipotético.
      return res.status(e.status || 502).json({
        error: 'Error de IA: ' + e.message,
        provider_fallo: provider,
        otro_proveedor: otro,
      })
    }

    try {
      const rows = await supabaseQuery(TABLE, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{
          codigo,
          url,
          ocr_texto: JSON.stringify(ocr),
          provider_usado: provider,
        }]),
      }, SUPABASE_URL, SUPABASE_KEY)

      const row = Array.isArray(rows) ? rows[0] : rows
      return res.status(200).json({ id: row?.id, ocr_texto: row?.ocr_texto, ocr, row })
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // ── PATCH { id, codigo_confirmado } → confirmar la lectura ─────────────────
  if (req.method === 'PATCH') {
    const body = req.body
    if (!body || !body.id) return res.status(400).json({ error: 'Falta el id de la imagen' })

    try {
      const rows = await supabaseQuery(TABLE + '?id=eq.' + encodeURIComponent(body.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          codigo_confirmado: (body.codigo_confirmado || '').trim(),
          ocr_confirmado: true,
        }),
      }, SUPABASE_URL, SUPABASE_KEY)

      const row = Array.isArray(rows) ? rows[0] : rows
      if (!row) return res.status(404).json({ error: 'Imagen no encontrada' })
      return res.status(200).json(row)
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  }

  // ── DELETE ?id=X → borra la fila y el archivo en Storage ───────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query || {}
    if (!id) return res.status(400).json({ error: 'Falta el id de la imagen' })

    let url = null
    try {
      const rows = await supabaseQuery(
        TABLE + '?select=url&id=eq.' + encodeURIComponent(id),
        {}, SUPABASE_URL, SUPABASE_KEY
      )
      url = Array.isArray(rows) && rows[0] ? rows[0].url : null
      if (!url) return res.status(404).json({ error: 'Imagen no encontrada' })

      await supabaseQuery(TABLE + '?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
      }, SUPABASE_URL, SUPABASE_KEY)
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }

    // La fila ya no está: si el archivo no se puede borrar, avisamos pero no
    // fallamos — dejar la fila huérfana sería peor.
    const path = storagePathDesdeUrl(url)
    if (!path) return res.status(200).json({ success: true, warning: 'No se pudo deducir el archivo en Storage' })

    try {
      const r = await fetch(
        SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path,
        { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
      )
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('[product-images storage delete]', r.status, txt.substring(0, 200))
        return res.status(200).json({ success: true, warning: 'La foto se borró del listado pero quedó el archivo en Storage' })
      }
    } catch (e) {
      console.error('[product-images storage delete]', e.message)
      return res.status(200).json({ success: true, warning: 'La foto se borró del listado pero quedó el archivo en Storage' })
    }

    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: 'Metodo no permitido' })
}
