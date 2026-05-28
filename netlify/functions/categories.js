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

  const params = event.queryStringParameters || {};
  const id = params.id;
  const type = params.type;

  // GET — devuelve todas las categorías con subcategorías anidadas
  if (event.httpMethod === "GET") {
    const [catRes, subRes] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/categories?select=*&order=orden.asc&activa=eq.true", { headers: h }),
      fetch(SUPABASE_URL + "/rest/v1/subcategories?select=*&order=orden.asc&activa=eq.true", { headers: h }),
    ]);
    const [cats, subs] = await Promise.all([catRes.json(), subRes.json()]);
    if (!catRes.ok) return { statusCode: catRes.status, headers: CORS, body: JSON.stringify(cats) };
    const merged = cats.map(cat => ({
      ...cat,
      subcategories: subs.filter(s => s.category_id === cat.id),
    }));
    return { statusCode: 200, headers: CORS, body: JSON.stringify(merged) };
  }

  // POST — crear categoría o subcategoría
  if (event.httpMethod === "POST") {
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request invalido" }) };
    }

    if (body.type === "subcategory") {
      const { category_id, nombre, descripcion, keywords, orden } = body;
      if (!category_id || !nombre) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan campos obligatorios" }) };
      }
      const res = await fetch(SUPABASE_URL + "/rest/v1/subcategories", {
        method: "POST",
        headers: { ...h, "Prefer": "return=representation" },
        body: JSON.stringify({ category_id, nombre, descripcion: descripcion || null, keywords: keywords || null, orden: orden || 0 }),
      });
      const data = await res.json();
      if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify(data[0] || {}) };
    }

    // Crear categoría
    const { nombre, color, icono, orden } = body;
    if (!nombre) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "El nombre es obligatorio" }) };
    }
    const res = await fetch(SUPABASE_URL + "/rest/v1/categories", {
      method: "POST",
      headers: { ...h, "Prefer": "return=representation" },
      body: JSON.stringify({ nombre, color: color || "#3b82f6", icono: icono || "📦", orden: orden || 0 }),
    });
    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers: CORS, body: JSON.stringify(data) };
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data[0] || {}) };
  }

  // PUT — actualizar categoría o subcategoría
  if (event.httpMethod === "PUT") {
    if (!id || !type) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan parámetros id o type" }) };
    }
    let body;
    try { body = JSON.parse(event.body); } catch (e) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Request invalido" }) };
    }

    const table = type === "subcategory" ? "subcategories" : "categories";
    const allowedCat = ["nombre", "color", "icono", "orden", "activa"];
    const allowedSub = ["nombre", "descripcion", "keywords", "orden", "activa"];
    const allowed = type === "subcategory" ? allowedSub : allowedCat;
    const patch = {};
    allowed.forEach(k => { if (body[k] !== undefined) patch[k] = body[k]; });

    const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?id=eq." + id, {
      method: "PATCH",
      headers: { ...h, "Prefer": "return=minimal" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { statusCode: res.status, headers: CORS, body: JSON.stringify(err) };
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
  }

  // DELETE — eliminar categoría o subcategoría
  if (event.httpMethod === "DELETE") {
    if (!id || !type) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Faltan parámetros id o type" }) };
    }
    const table = type === "subcategory" ? "subcategories" : "categories";
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?id=eq." + id, {
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
