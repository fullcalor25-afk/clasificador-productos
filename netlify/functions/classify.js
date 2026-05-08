const fetch = require("node-fetch");

// Modelos de Groq (Llama 3)
var MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

const SYSTEM_PROMPT = `Eres un experto en clasificacion de productos industriales (calefaccion, plomeria, gas, herramientas, electricidad, jardineria, refrigeracion, etc).

Tu unica tarea es analizar la lista de productos provista y clasificarlos.
DEBES responder UNICAMENTE con un objeto JSON valido que contenga una propiedad "results", la cual debe ser un array de objetos.
Cada objeto en el array "results" debe tener exactamente esta estructura:
{
  "codigo": "el codigo original del producto",
  "clasificacion": "UNA DE LAS SIGUIENTES CATEGORIAS EXACTAS: REPUESTO, ACCESORIO, PRODUCTO_COMPLETO, SERVICIO, OTRO",
  "confianza": 85,
  "razon": "Explicacion breve de 1 linea de por que se eligio esa categoria"
}

Criterios de clasificacion estricta:
- REPUESTO: pieza que reemplaza una parte dañada de un equipo mayor (diafragmas, electrodos, valvulas, plaquetas, correas, sensores, termocuplas, membranas, unidades magneticas, fichas, etc.)
- ACCESORIO: pieza complementaria para instalaciones (cuplas, racores, tees, codos, conectores, adaptadores, niples, abrazaderas, desfangadores, filtros de linea, etc.)
- PRODUCTO_COMPLETO: equipo principal autonomo que funciona por si solo (calderas, bombas, extractores, compresores, herramientas electricas, salamandras, equipos de aire, cortacercos, electrobombas, escaleras, etc.)
- SERVICIO: mano de obra, instalacion o servicio tecnico
- OTRO: no encaja claramente en ninguna categoria anterior (pilas, materiales genericos, cortinas, etc.)

IMPORTANTE: 
1. La clasificacion DEBE ser una de las opciones exactas en MAYUSCULAS.
2. Tu respuesta debe ser solo el JSON.`;

function buildUserPrompt(products) {
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
  return "Productos a clasificar:\n" + JSON.stringify(sample, null, 2);
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

  var apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "GROQ_API_KEY no configurada en Netlify." }) };
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

  var userPrompt = buildUserPrompt(products);
  var lastError = "Error desconocido";

  // Try each model
  for (var m = 0; m < MODELS.length; m++) {
    var model = MODELS[m];
    console.log("Intentando modelo Groq:", model);

    try {
      var url = "https://api.groq.com/openai/v1/chat/completions";

      var response = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": "Bearer " + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });

      if (response.status === 429) {
        console.log("Rate limit en", model);
        lastError = "Rate limit en " + model;
        continue;
      }

      if (response.status === 503 || response.status === 500) {
        console.log("Modelo sobrecargado o error interno:", model);
        lastError = "Modelo " + model + " sobrecargado";
        continue;
      }

      if (response.status === 401) {
        return { statusCode: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: "API Key de Groq invalida. Revisa tu GROQ_API_KEY." }) };
      }

      if (!response.ok) {
        var errTxt = await response.text();
        console.log("Error", response.status, "en", model, ":", errTxt.substring(0, 200));
        lastError = "Error " + response.status + " en " + model;
        continue;
      }

      // Parse success response
      var data = await response.json();
      var text = "";
      try {
        text = data.choices[0].message.content;
      } catch (e) {
        console.log("Estructura de respuesta inesperada:", e.message);
        continue;
      }

      if (!text) {
        console.log("Respuesta vacia de", model);
        lastError = "Respuesta vacia de " + model;
        continue;
      }

      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        console.log("No se pudo parsear respuesta JSON de", model);
        lastError = "Respuesta no parseable de " + model;
        continue;
      }

      var results = parsed.results;

      if (!results || !Array.isArray(results)) {
        console.log("La respuesta no contiene un array 'results'", model);
        lastError = "Formato de resultados incorrecto en " + model;
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
    body: JSON.stringify({ error: "Todos los modelos de Groq fallaron. Espera unos minutos. Ultimo error: " + lastError }),
  };
};
