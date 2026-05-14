const fetch = require("node-fetch");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

  const h = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  const id = (event.queryStringParameters || {}).id;

  // GET lista o detalle
  if (event.httpMethod === "GET") {
    if (id) {
      const [anaRes, prodRes] = await Promise.all([
        fetch(SUPABASE_URL + "/rest/v1/analyses?id=eq." + id + "&select=*", { headers: h }),
        fetch(SUPABASE_URL + "/rest/v1/analysis_products?analysis_id=eq." + id + "&select=*&order=id.asc", { headers: h }),
      ]);
      const [analysis, products] = await Promise.all([anaRes.json(), prodRes.json()]);
      if (!anaRes.ok) return { statusCode: anaRes.status, headers: CORS, body: JSON.stringify(analysis) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ...analysis[0], products }) };
    }
    const res = await fetch(SUPABASE_URL + "/rest/v1/analyses?select=*&order=created_at.desc", { headers: h });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  }

  // POST crear análisis
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request invalido" }) };
    }
    const { nombre, productos } = body;
    if (!nombre || !Array.isArray(productos)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    const stats = { total: productos.length, repuestos: 0, accesorios: 0, completos: 0, servicios: 0, otros: 0, aprendidos: 0 };
    productos.forEach(p => {
      const cls = p.clasificacion || "OTRO";
      if (cls === "REPUESTO") stats.repuestos++;
      else if (cls === "ACCESORIO") stats.accesorios++;
      else if (cls === "PRODUCTO_COMPLETO") stats.completos++;
      else if (cls === "SERVICIO") stats.servicios++;
      else stats.otros++;
      if (p.fuente === "APRENDIDO") stats.aprendidos++;
    });

    const anaRes = await fetch(SUPABASE_URL + "/rest/v1/analyses", {
      method: "POST",
      headers: { ...h, "Prefer": "return=representation" },
      body: JSON.stringify({ nombre, ...stats, created_at: new Date().toISOString() }),
    });
    const anaData = await anaRes.json();
    if (!anaRes.ok) return { statusCode: anaRes.status, headers: CORS, body: JSON.stringify(anaData) };

    const analysisId = anaData[0].id;
    const BATCH = 100;
    for (let i = 0; i < productos.length; i += BATCH) {
      const batch = productos.slice(i, i + BATCH).map(p => ({ ...p, analysis_id: analysisId }));
      const bRes = await fetch(SUPABASE_URL + "/rest/v1/analysis_products", {
        method: "POST",
        headers: { ...h, "Prefer": "return=minimal" },
        body: JSON.stringify(batch),
      });
      if (!bRes.ok) {
        const err = await bRes.json().catch(() => ({}));
        console.log("Error insertando productos lote", i, err);
      }
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ id: analysisId }) };
  }

  // PUT renombrar
  if (event.httpMethod === "PUT") {
    if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Falta id" }) };
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request invalido" }) };
    }
    const res = await fetch(SUPABASE_URL + "/rest/v1/analyses?id=eq." + id, {
      method: "PATCH",
      headers: { ...h, "Prefer": "return=minimal" },
      body: JSON.stringify({ nombre: body.nombre }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  // DELETE
  if (event.httpMethod === "DELETE") {
    if (!id) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Falta id" }) };
    const res = await fetch(SUPABASE_URL + "/rest/v1/analyses?id=eq." + id, {
      method: "DELETE",
      headers: { ...h, "Prefer": "return=minimal" },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Metodo no permitido" }) };
};
