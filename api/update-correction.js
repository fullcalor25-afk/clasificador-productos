import { createClient } from '@supabase/supabase-js'

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
}

export default async function handler(req, res) {
  setCORS(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { codigo, producto, rubro, subRubro, clasificacion_manual } = req.body || {}

  if (!codigo || !clasificacion_manual)
    return res.status(400).json({ error: 'Faltan datos obligatorios (codigo o clasificacion)' })

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_KEY

  if (!supabaseUrl || !supabaseKey)
    return res.status(500).json({ error: 'Variables de entorno de Supabase no configuradas' })

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error } = await supabase
    .from('clasificaciones')
    .upsert({
      codigo,
      producto:             producto  || '',
      rubro:                rubro     || '',
      sub_rubro:            subRubro  || '',
      clasificacion_manual,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'codigo' })

  if (error) {
    console.log('Error guardando correccion:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true })
}
