const fetch = require("node-fetch");

// Fallback chain: if one model is rate-limited or overloaded, try the next
var MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

function buildPrompt(products) {
  var sample = [];
  for (var i = 0; i < Math.min(products.length, 50); i++) {
    var p = products[i];
    sample.push({
      codigo: p.CODIGO || "",
      producto: p.PRODUCTO || "",
      rubro: p.RUBRO || "",
      subRubro: p["SUB RUBRO"] || "",
    });
  }

  return "Eres un experto en clasificacion de productos industriales (calefaccion, plomeria, gas, herramientas, electricidad, jardineria, refrigeracion, etc).\n\n" +
    "Clasifica CADA producto como exactamente UNA de estas categorias:\n" +
    "- REPUESTO: pieza que reemplaza una parte dañada de un equipo mayor (diafragmas, electrodos, valvulas, plaquetas, correas, sensores, termocuplas, membranas, unidades magneticas, fichas, etc.)\n" +
    "- ACCESORIO: pieza complementaria para instalaciones (cuplas, racores, tees, codos, conectores, adaptadores, niples, abrazaderas, desfangadores, filtros de linea, etc.)\n" +
    "- PRODUCTO_COMPLETO: equipo principal autonomo que funciona por si solo (calderas, bombas, extractores, compresores, herramientas electricas, salamandras, equipos de aire, cortacercos, electrobombas, escaleras, etc.)\n" +
    "- SERVICIO: mano de obra, instalacion o servicio tecnico\n" +
    "- OTRO: no encaja claramente en ninguna categoria anterior (pilas, materiales genericos, cortinas, etc.)\n\n" +
    "IMPORTANTE: Responde SOLO con un array JSON valido. Sin markdown, sin backticks, sin texto adicional.\n" +
    'Formato exacto:\n[{"codigo":"X","clasificacion":"REPUESTO","confianza":85,"razon":"explicacion breve"}]\n\n' +
    "Productos a clasificar:\n" + JSON.stringify(sample, null, 2);
}

function extractText(data) {
  var text = "";
  try {
    var parts = data.candidates[0].content.parts;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].text) text += parts[i].text;
    }
  } catch (e) { /* ignore */ }
  return text;
}

function parseJSON(text) {
  var clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    var match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

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

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "GEMINI_API_KEY no configurada en Netlify." }) };
  }

  var products;
  try {
    products = JSON.parse(event.body).products;
  } catch (e) {
    return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "Request invalido" }) };
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    return { statusCode: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "No se enviaron productos" }) };
  }

  var prompt = buildPrompt(products);
  var lastError = "Error desconocido";

  // Try each model
  for (var m = 0; m < MODELS.length; m++) {
    var model = MODELS[m];
    console.log("Intentando modelo:", model);

    try {
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;

      var response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      });

      if (response.status === 429) {
        console.log("Rate limit en", model);
        lastError = "Rate limit en " + model;
        continue;
      }

      if (response.status === 503) {
        console.log("Modelo sobrecargado:", model);
        lastError = "Modelo " + model + " sobrecargado";
        continue;
      }

      if (response.status === 400 || response.status === 403) {
        var errTxt = await response.text();
        // Check if it's an API key error vs a model-specific error
        if (errTxt.indexOf("API_KEY_INVALID") !== -1 || errTxt.indexOf("API key not valid") !== -1) {
          return { statusCode: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "API Key invalida. Genera una nueva en aistudio.google.com/apikey" }) };
        }
        console.log("Error 400/403 en", model, ":", errTxt.substring(0, 200));
        lastError = "Error en " + model;
        continue;
      }

      if (!response.ok) {
        console.log("Error", response.status, "en", model);
        lastError = "Error " + response.status + " en " + model;
        continue;
      }

      // Parse success response
      var data = await response.json();
      var text = extractText(data);

      if (!text) {
        console.log("Respuesta vacia de", model);
        lastError = "Respuesta vacia de " + model;
        continue;
      }

      var results = parseJSON(text);

      if (!results || !Array.isArray(results)) {
        console.log("No se pudo parsear respuesta de", model);
        lastError = "Respuesta no parseable de " + model;
        continue;
      }

      console.log("Exito con", model, "-", results.length, "productos clasificados");
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ results: results }),
      };

    } catch (err) {
      console.log("Excepcion con", model, ":", err.message);
      lastError = "Error de conexion con " + model;
      continue;
    }
  }

  // All models failed
  return {
    statusCode: 503,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ error: "Todos los modelos estan saturados. Espera unos minutos. Ultimo error: " + lastError }),
  };
};
