const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event) {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Request invalido" }) };
  }

  const { codigo, producto, rubro, subRubro, clasificacion_manual } = body;

  if (!codigo || !clasificacion_manual) {
    return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Faltan datos obligatorios (codigo o clasificacion)" }) };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Variables de entorno de Supabase no configuradas" }) };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Usamos upsert: si el código ya existe, lo actualiza. Si no, lo crea.
  const { error } = await supabase
    .from('clasificaciones')
    .upsert({
      codigo: codigo,
      producto: producto || '',
      rubro: rubro || '',
      sub_rubro: subRubro || '',
      clasificacion_manual: clasificacion_manual,
      updated_at: new Date().toISOString()
    }, { onConflict: 'codigo' });

  if (error) {
    console.log("Error guardando correccion:", error);
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: error.message }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ success: true }),
  };
};
