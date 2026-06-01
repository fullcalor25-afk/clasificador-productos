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
