const fetch = require("node-fetch");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Supabase no está configurado en Netlify" }) };
  }

  const h = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  const id = (event.queryStringParameters || {}).id;

  // GET: Fetch rules
  if (event.httpMethod === "GET") {
    try {
      const res = await fetch(SUPABASE_URL + "/rest/v1/classification_rules?select=*&order=id.asc", { headers: h });
      const data = await res.json();
      if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // POST: Create, edit, or seed rules
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request inválido" }) };
    }

    // Check seed / reset trigger
    if (body.reset === true && Array.isArray(body.defaults)) {
      try {
        // 1. Wipe existing rules
        await fetch(SUPABASE_URL + "/rest/v1/classification_rules?id=gt.0", {
          method: "DELETE",
          headers: h
        });

        // 2. Insert new default rules in chunks of 50
        const batchSize = 50;
        for (let i = 0; i < body.defaults.length; i += batchSize) {
          const chunk = body.defaults.slice(i, i + batchSize).map(r => ({
            tipo: r.tipo,
            nivel: r.nivel,
            valor: r.valor,
            peso: r.peso,
            activa: r.activa !== undefined ? r.activa : true
          }));

          await fetch(SUPABASE_URL + "/rest/v1/classification_rules", {
            method: "POST",
            headers: { ...h, "Prefer": "return=minimal" },
            body: JSON.stringify(chunk)
          });
        }

        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, seeded: body.defaults.length }) };
      } catch (e) {
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }

    // Individual rule creation
    const { tipo, nivel, valor, peso, activa } = body;
    if (!tipo || !nivel || !valor) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan campos requeridos" }) };
    }

    try {
      const payload = { tipo, nivel, valor, peso: peso !== undefined ? peso : 10, activa: activa !== undefined ? activa : true };
      const res = await fetch(SUPABASE_URL + "/rest/v1/classification_rules", {
        method: "POST",
        headers: { ...h, "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data[0] || {}) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // DELETE: Remove rule
  if (event.httpMethod === "DELETE") {
    if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Falta parámetro ID" }) };
    try {
      const res = await fetch(SUPABASE_URL + "/rest/v1/classification_rules?id=eq." + id, {
        method: "DELETE",
        headers: h,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Método no permitido" }) };
};
