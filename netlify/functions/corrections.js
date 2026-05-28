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
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: "Variables de Supabase no configuradas" }) };
  }

  const h = {
    "apikey": SUPABASE_KEY,
    "Authorization": "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };

  const qs = event.queryStringParameters || {};

  // ── GET: lista con paginación y búsqueda opcionales ──────────────────────
  if (event.httpMethod === "GET") {
    const page  = parseInt(qs.page  || "0", 10);
    const limit = parseInt(qs.limit || "0", 10); // 0 = sin límite
    const search = qs.search || "";

    let url = SUPABASE_URL + "/rest/v1/corrections?select=*&order=updated_at.desc";

    if (search) {
      // ilike search over producto and codigo
      url += `&or=(codigo.ilike.*${encodeURIComponent(search)}*,producto.ilike.*${encodeURIComponent(search)}*)`;
    }

    if (limit > 0) {
      const from = page * limit;
      const to   = from + limit - 1;
      h["Range"] = `${from}-${to}`;
      h["Prefer"] = "count=exact";
    }

    try {
      const res  = await fetch(url, { headers: h });
      const data = await res.json();
      if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
    } catch (e) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── POST: guardar una corrección O importar masivamente ─────────────────
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request inválido" }) };
    }

    // Bulk import: body = { bulk: [{codigo, clasificacion_corregida, ...}] }
    if (body.bulk && Array.isArray(body.bulk)) {
      const rows = body.bulk;
      if (rows.length === 0) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "El array bulk está vacío" }) };
      }

      const now = new Date().toISOString();
      const payloads = rows
        .filter(r => r.codigo && r.clasificacion_corregida)
        .map(r => ({
          codigo: r.codigo,
          producto:              r.producto || "",
          rubro:                 r.rubro || "",
          sub_rubro:             r.sub_rubro || "",
          clasificacion_corregida: r.clasificacion_corregida,
          updated_at:            now,
        }));

      if (payloads.length === 0) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Ninguna fila válida encontrada" }) };
      }

      // Insert in chunks of 100, upsert on codigo conflict
      const CHUNK = 100;
      let inserted = 0;
      for (let i = 0; i < payloads.length; i += CHUNK) {
        const chunk = payloads.slice(i, i + CHUNK);
        const res = await fetch(SUPABASE_URL + "/rest/v1/corrections", {
          method: "POST",
          headers: { ...h, "Prefer": "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(chunk),
        });
        if (res.ok) inserted += chunk.length;
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, inserted }) };
    }

    // Single correction upsert
    const { codigo, producto, rubro, sub_rubro, clasificacion_corregida } = body;
    if (!codigo || !clasificacion_corregida) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
    }

    const payload = {
      codigo,
      producto: producto || "",
      rubro:    rubro || "",
      sub_rubro: sub_rubro || "",
      clasificacion_corregida,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(SUPABASE_URL + "/rest/v1/corrections", {
      method: "POST",
      headers: { ...h, "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  // ── DELETE: una corrección por id o codigo, o todas con ?all=true ────────
  if (event.httpMethod === "DELETE") {
    const { id, codigo, all } = qs;

    // Borrar todas las correcciones
    if (all === "true") {
      const res = await fetch(SUPABASE_URL + "/rest/v1/corrections?id=gt.0", {
        method: "DELETE",
        headers: { ...h, "Prefer": "return=minimal" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // Borrar por id
    if (id) {
      const res = await fetch(SUPABASE_URL + "/rest/v1/corrections?id=eq." + id, {
        method: "DELETE",
        headers: { ...h, "Prefer": "return=minimal" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // Borrar por codigo
    if (codigo) {
      const res = await fetch(SUPABASE_URL + "/rest/v1/corrections?codigo=eq." + encodeURIComponent(codigo), {
        method: "DELETE",
        headers: { ...h, "Prefer": "return=minimal" },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Falta parámetro: id, codigo o all=true" }) };
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Método no permitido" }) };
};
