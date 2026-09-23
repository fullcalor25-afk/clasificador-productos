// Shared helpers for Vercel serverless functions
// Files prefixed with _ are excluded from Vercel routing (not exposed as endpoints)

export function logRequest(label, data) {
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API) {
    console.log(`[${label}]`, JSON.stringify(data, null, 2).substring(0, 500))
  }
}

export async function supabaseQuery(path, options = {}, supabaseUrl, supabaseKey) {
  const res = await fetch(supabaseUrl + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: 'Bearer ' + supabaseKey,
      ...(options.headers || {}),
    },
  })

  if (res.status === 204) return null

  if (!res.ok) {
    const errText = await res.text().catch(() => '{}')
    console.error('[supabase]', res.status, errText.substring(0, 300))
    let errObj
    try { errObj = JSON.parse(errText) } catch { errObj = { error: errText } }
    const err = new Error(errObj.message || errObj.error || `Supabase error ${res.status}`)
    err.status = res.status
    err.details = errObj
    throw err
  }

  return res.json()
}

// ── Cerebras: el mismo modelo que Groq, en otra cuota ────────────────────────
// Cerebras corre gpt-oss-120b, exactamente el mismo modelo que usamos en Groq.
// Por eso alternar entre los dos reparte el límite sin cambiar en nada cómo
// queda el catálogo: piensa el mismo modelo, cambia la máquina donde corre.
// Su API es compatible con la de OpenAI, así que el request es igual al de Groq.
export const CEREBRAS_MODEL = 'gpt-oss-120b'
export const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions'

// El plan gratis de Cerebras limita el contexto a 8K tokens (entrada + salida).
// Con ~1.5K de prompt de sistema y 4K reservados de salida, 30 productos por
// lote entran con margen; 50 no. De ahí el tamaño de lote en useClassification.
export const CEREBRAS_MAX_TOKENS = 4096

// ── Gemini como respaldo de Groq ─────────────────────────────────────────────
// Groq sigue siendo el camino normal (más rápido y más barato). Gemini entra
// cuando Groq corta, para que un límite de cuota no frene el análisis.
// El modelo vive acá y no en cada archivo: es el mismo en tres lugares.
export const GEMINI_MODEL = 'gemini-3.8-flash'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Llama a Gemini y devuelve el TEXTO CRUDO, sin parsear a propósito: classify
 * espera {results: [...]} y enrich espera un array pelado, así que cada uno
 * sigue usando su propio parseo y su post-procesado sin cambios.
 */
export async function llamarGemini({ systemPrompt, userPrompt, apiKey, temperature = 0.2, maxTokens = 8192 }) {
  const r = await fetch(
    GEMINI_URL + '/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          // Devuelve JSON limpio, sin los bloques ```json que hay que limpiar
          // a mano en las respuestas de Groq.
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    console.error('[gemini]', r.status, txt.substring(0, 300))
    if (r.status === 401 || r.status === 403) throw new Error('GEMINI_API_KEY invalida o sin permisos')
    if (r.status === 429) throw new Error('Gemini tambien esta limitado por cuota')
    throw new Error('Error de Gemini (' + r.status + ')')
  }

  const data = await r.json()
  const texto = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text)
    .filter(Boolean)
    .join('\n')

  if (!texto) throw new Error('Gemini devolvio una respuesta vacia')
  return texto
}
