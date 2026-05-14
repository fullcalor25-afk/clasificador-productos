const fetch = require("node-fetch");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Variables de Supabase no configuradas" }) };
  }

  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "GET") {
    const res = await fetch(SUPABASE_URL + "/rest/v1/corrections?select=*&order=updated_at.desc", { headers });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  }

  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request invalido" }) };
    }
    const { codigo, producto, rubro, sub_rubro, clasificacion_corregida } = body;
    if (!codigo || !clasificacion_corregida) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }
    const payload = { codigo, producto: producto || "", rubro: rubro || "", sub_rubro: sub_rubro || "", clasificacion_corregida, updated_at: new Date().toISOString() };
    const res = await fetch(SUPABASE_URL + "/rest/v1/corrections", {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Metodo no permitido" }) };
};
