// netlify/functions/classify.js
// Uses Google Gemini API (FREE - 1,500 requests/day)
// Get your free key at: https://aistudio.google.com/apikey

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "GEMINI_API_KEY no configurada. Agregala en Netlify > Site configuration > Environment variables",
      }),
    };
  }

  try {
    const { products } = JSON.parse(event.body);

    if (!products || !Array.isArray(products) || products.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No products provided" }) };
    }

    // Process up to 50 products per request (Gemini has large context window)
    const sample = products.slice(0, 50).map((p) => ({
      codigo: p.CODIGO,
      producto: p.PRODUCTO,
      rubro: p.RUBRO,
      subRubro: p["SUB RUBRO"],
    }));

    const prompt = `Eres un experto en clasificacion de productos industriales (calefaccion, plomeria, gas, herramientas, electricidad, jardineria, refrigeracion, etc). 

Clasifica CADA producto como exactamente UNA de estas categorias:
- REPUESTO: pieza que reemplaza una parte dañada de un equipo mayor (diafragmas, electrodos, valvulas, plaquetas, correas, sensores, termocuplas, membranas, unidades magneticas, fichas, etc.)
- ACCESORIO: pieza complementaria para instalaciones (cuplas, racores, tees, codos, conectores, adaptadores, niples, abrazaderas, desfangadores, filtros de linea, etc.)
- PRODUCTO_COMPLETO: equipo principal autonomo que funciona por si solo (calderas, bombas, extractores, compresores, herramientas electricas, salamandras, equipos de aire, cortacercos, electrobombas, escaleras, etc.)
- SERVICIO: mano de obra, instalacion o servicio tecnico
- OTRO: no encaja claramente en ninguna categoria anterior (pilas, materiales genericos, cortinas, etc.)

IMPORTANTE: Responde SOLO con un array JSON valido. Sin markdown, sin backticks, sin texto adicional.
Formato exacto:
[{"codigo":"X","clasificacion":"REPUESTO","confianza":85,"razon":"explicacion breve en español"}]

Productos a clasificar:
${JSON.stringify(sample, null, 2)}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);

      let userMessage = `Error de API: ${response.status}`;
      if (response.status === 429) {
        userMessage = "Limite de requests alcanzado. El plan gratuito permite 1,500 req/dia. Intenta de nuevo mas tarde.";
      } else if (response.status === 403) {
        userMessage = "API Key invalida o sin permisos. Verifica tu GEMINI_API_KEY en https://aistudio.google.com/apikey";
      }

      return {
        statusCode: response.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: userMessage }),
      };
    }

    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") || "";
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let results;
    try {
      results = JSON.parse(clean);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response:", clean.substring(0, 500));
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          results = JSON.parse(match[0]);
        } catch (e) {
          return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "No se pudo parsear la respuesta de la IA" }),
          };
        }
      } else {
        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Respuesta de IA en formato inesperado" }),
        };
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ results }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
