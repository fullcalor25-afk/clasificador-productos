// Utilities for HVAC Pro Classifier

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseTabular(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const semicolonCount = (first.match(/;/g) || []).length;
  const delimiter = tabCount >= commaCount && tabCount >= semicolonCount ? "\t"
    : semicolonCount > commaCount ? ";" : ",";
  const headers = first.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(delimiter);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || "").trim().replace(/^"|"$/g, ""); });
    return obj;
  });
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function slugify(text) {
  return (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function buildCategoriaTN(product, tnCategories = []) {
  // Prioridad 1: dato enriquecido por IA
  if (product._enriched?.categoria_tiendanube) {
    return product._enriched.categoria_tiendanube;
  }

  // Prioridad 2: matching por keywords del nombre del producto
  if (tnCategories.length > 0 && product.PRODUCTO) {
    const nombre = (product.PRODUCTO || "").toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    tnCategories.forEach(cat => {
      if (!cat.keywords) return;
      const kws = cat.keywords.split(",").map(k => k.trim().toLowerCase());
      const score = kws.filter(kw => kw && nombre.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestMatch = cat; }
    });
    if (bestMatch && bestScore > 0) {
      return [
        bestMatch.nivel1, bestMatch.nivel2, bestMatch.nivel3, bestMatch.nivel4,
      ].filter(Boolean).join(" > ");
    }
  }

  // Prioridad 3: categoría interna del clasificador
  if (product._categoria && product._subcategoria) {
    return `Repuestos y Accesorios > ${product._categoria} > ${product._subcategoria}`;
  }
  if (product._categoria) {
    return `Repuestos y Accesorios > ${product._categoria}`;
  }

  return "Repuestos y Accesorios";
}

export function getCategoriaTN(product, tnCategories = []) {
  if (product._tn_manual && product._enriched?.categoria_tiendanube) {
    return product._enriched.categoria_tiendanube;
  }
  if (product._enriched?.categoria_tiendanube) {
    return product._enriched.categoria_tiendanube;
  }
  if (tnCategories.length > 0 && product.PRODUCTO) {
    const nombre = (product.PRODUCTO || "").toLowerCase();
    let bestMatch = null;
    let bestScore = 0;
    tnCategories.forEach(cat => {
      if (!cat.keywords) return;
      const kws = cat.keywords.split(",").map(k => k.trim().toLowerCase());
      const score = kws.filter(kw => kw && nombre.includes(kw)).length;
      if (score > bestScore) { bestScore = score; bestMatch = cat; }
    });
    if (bestMatch && bestScore > 0) {
      return [bestMatch.nivel1, bestMatch.nivel2, bestMatch.nivel3, bestMatch.nivel4]
        .filter(Boolean).join(" > ");
    }
  }
  if (product._categoria) {
    const parts = ["Repuestos y Accesorios", product._categoria, product._subcategoria]
      .filter(Boolean);
    return parts.join(" > ");
  }
  return "Repuestos y Accesorios";
}

export function getProductPrice(p) {
  const keys = ["PRECIO", "precio", "Precio", "PRICE", "price"];
  for (const k of keys) {
    if (p[k] !== undefined && p[k] !== null && p[k] !== "") {
      const cleaned = p[k].toString().replace(/[^\d.,-]/g, "").replace(",", ".");
      const val = parseFloat(cleaned);
      if (!isNaN(val)) return val;
    }
  }
  return 0;
}

export function classifyProduct(product, rules = []) {
  const nombre = (product.PRODUCTO || "").toLowerCase();
  const rubro = (product.RUBRO || "").toLowerCase();
  const subRubro = (product["SUB RUBRO"] || "").toLowerCase();

  let score = 0;
  let reasons = [];

  // Filter active rules
  const activeRules = rules.length > 0 ? rules.filter(r => r.activa !== false) : [];

  // Rubro pattern matches
  const rubroRules = activeRules.filter(r => r.nivel === 'rubro_pattern');
  rubroRules.forEach(r => {
    try {
      const rx = new RegExp(r.valor, 'i');
      if (rx.test(rubro)) {
        score += r.peso !== undefined ? r.peso : 40;
        reasons.push(`Rubro matchea: ${r.valor}`);
      }
    } catch (e) {
      // Ignore invalid regex
    }
  });

  // Subrubro pattern matches
  const subrubroRules = activeRules.filter(r => r.nivel === 'subrubro_pattern');
  subrubroRules.forEach(r => {
    try {
      const rx = new RegExp(r.valor, 'i');
      if (rx.test(subRubro)) {
        score += r.peso !== undefined ? r.peso : 30;
        reasons.push(`Subrubro matchea: ${r.valor}`);
      }
    } catch (e) {
      // Ignore invalid regex
    }
  });

  // Keywords matches
  const keywordRules = activeRules.filter(r => r.nivel === 'keyword');
  
  // Repuesto keywords
  const matchedRepuesto = keywordRules
    .filter(r => r.tipo === 'REPUESTO' && nombre.includes(r.valor.toLowerCase()))
    .map(r => r.valor.toLowerCase());
  if (matchedRepuesto.length > 0) {
    const weight = keywordRules.find(r => r.tipo === 'REPUESTO')?.peso || 15;
    score += Math.min(matchedRepuesto.length * weight, weight * 3);
    reasons.push("Palabras clave repuesto: " + matchedRepuesto.slice(0, 3).join(", "));
  }

  // Accesorio keywords
  const matchedAcc = keywordRules
    .filter(r => r.tipo === 'ACCESORIO' && nombre.includes(r.valor.toLowerCase()))
    .map(r => r.valor.toLowerCase());
  if (matchedAcc.length > 0) {
    const weight = keywordRules.find(r => r.tipo === 'ACCESORIO')?.peso || 10;
    score += Math.min(matchedAcc.length * weight, weight * 2.5);
    reasons.push("Accesorios: " + matchedAcc.slice(0, 3).join(", "));
  }

  // Producto Completo keywords
  const matchedCompleto = keywordRules
    .filter(r => r.tipo === 'PRODUCTO_COMPLETO' && nombre.includes(r.valor.toLowerCase()))
    .map(r => r.valor.toLowerCase());
  if (matchedCompleto.length > 0 && score < 50) {
    const weight = keywordRules.find(r => r.tipo === 'PRODUCTO_COMPLETO')?.peso || 20;
    score -= Math.min(matchedCompleto.length * weight, weight * 2);
    reasons.push("Producto completo: " + matchedCompleto.slice(0, 2).join(", "));
  }

  if (/\bpara\b/.test(nombre) && score > 0) {
    score += 10;
    reasons.push('Contiene "para" (parte de otro equipo)');
  }

  if (rubro === "service" || nombre.includes("instalacion")) {
    score = -50;
    reasons = ["Es un servicio"];
  }

  if (nombre.includes("materiales para") || nombre.includes("articulos de")) {
    score = 0;
    reasons = ["Categoría genérica"];
  }

  score = Math.max(-100, Math.min(100, score));
  const confidence = Math.abs(score);

  let classification;
  if (score >= 30) classification = "REPUESTO";
  else if (score >= 10) classification = "ACCESORIO";
  else if (score <= -20) classification = "SERVICIO";
  else if (score <= 0 && matchedCompleto.length > 0) classification = "PRODUCTO_COMPLETO";
  else classification = "OTRO";

  return { classification, confidence: Math.min(confidence, 100), reasons, score };
}

function cleanField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  const clean = str.replace(/^"+|"+$/g, "");
  if (clean.includes(";") || clean.includes("\n")) {
    return '"' + clean.replace(/"/g, '""') + '"';
  }
  return clean;
}

export function exportCSV(toExport, CLS) {
  if (toExport.length === 0) return alert("No hay productos para exportar.");

  const headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "PROVEEDOR", "CLASIFICACION", "CONFIANZA", "FUENTE", "RAZONES", "CATEGORIA", "SUBCATEGORIA", "TIPO"];
  const rows = toExport.map(p => [
    cleanField(p.CODIGO),
    cleanField(p.PRODUCTO),
    cleanField(p.RUBRO),
    cleanField(p["SUB RUBRO"]),
    cleanField(p.PROVEEDOR),
    cleanField(p._manualClass || p._class.classification),
    (p._class.confidence || 0) + "%",
    cleanField(p._manualClass ? "APRENDIDO" : (p._source || "REGLAS")),
    cleanField((p._class.reasons || []).join("; ")),
    cleanField(p._tn_nivel2 || p._enriched?.categoria_tiendanube?.split(' > ')[1] || p._categoria || ''),
    cleanField(p._tn_nivel3 || p._enriched?.categoria_tiendanube?.split(' > ')[2] || p._subcategoria || ''),
    cleanField(p._tipo),
  ]);
  const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "productos_clasificados.csv"; a.click();
  URL.revokeObjectURL(url);
}

export function exportHistoryCSV(productos, includeTN = false) {
  if (!productos || productos.length === 0) return;

  let headers;
  let rows;

  if (includeTN) {
    headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "CLASIFICACION", "FUENTE", "CONFIANZA", "SLUG", "NOMBRE_LIMPIO", "MARCA", "DESCRIPCION_HTML", "TAGS", "SEO_TITULO", "SEO_DESCRIPCION", "PESO_KG", "ALTO_CM", "ANCHO_CM", "PROFUNDIDAD_CM", "CATEGORIA_TIENDANUBE"];
    rows = productos.map(p => {
      const e = p._enriched || {};
      return [
        cleanField(p.codigo),
        cleanField(p.producto),
        cleanField(p.rubro),
        cleanField(p.sub_rubro),
        cleanField(p.clasificacion),
        cleanField(p.fuente),
        (p.confianza || 0) + "%",
        cleanField(e.slug),
        cleanField(e.nombre_limpio),
        cleanField(e.marca),
        cleanField(e.descripcion_html),
        cleanField(Array.isArray(e.tags) ? e.tags.join(", ") : (e.tags || "")),
        cleanField(e.seo_titulo),
        cleanField(e.seo_descripcion),
        cleanField(e.peso_kg),
        cleanField(e.alto_cm),
        cleanField(e.ancho_cm),
        cleanField(e.profundidad_cm),
        cleanField(e.categoria_tiendanube),
      ];
    });
  } else {
    headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "CLASIFICACION", "FUENTE", "CONFIANZA"];
    rows = productos.map(p => [
      cleanField(p.codigo),
      cleanField(p.producto),
      cleanField(p.rubro),
      cleanField(p.sub_rubro),
      cleanField(p.clasificacion),
      cleanField(p.fuente),
      (p.confianza || 0) + "%",
    ]);
  }

  const csv = [headers.join(";"), ...rows.map(r => r.join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "analisis_exportado.csv"; a.click();
  URL.revokeObjectURL(url);
}

export async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Wrapper over fetchWithTimeout that:
 * - Adds Content-Type: application/json by default
 * - Auto-parses JSON response
 * - Throws on non-2xx status (error.message = server error string)
 * - Maps network errors to user-friendly messages
 */
export async function apiFetch(url, options = {}) {
  try {
    const res = await fetchWithTimeout(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({ error: "Respuesta inválida del servidor" }));
    if (!res.ok) {
      const msg = data.error || data.message || `Error ${res.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Tiempo de espera agotado. Intentá de nuevo.");
    if (err.name === "TypeError" && err.message.includes("fetch")) {
      throw new Error("Sin conexión. Verificá tu internet.");
    }
    throw err;
  }
}

export function exportTiendaNubeCSV(productos, tnCategories = []) {
  const SEP = ";";

  // 24 columnas — formato exacto de la tienda real
  const HEADERS = [
    '"Identificador de URL"',
    'Nombre',
    'Categorías',
    'Precio',
    '"Precio promocional"',
    '"Peso (kg)"',
    '"Alto (cm)"',
    '"Ancho (cm)"',
    '"Profundidad (cm)"',
    'Stock',
    'SKU',
    '"Código de barras"',
    '"Mostrar en tienda"',
    '"Envío sin cargo"',
    'Descripción',
    'Tags',
    '"Título para SEO"',
    '"Descripción para SEO"',
    'Marca',
    '"Producto Físico"',
    '"MPN (Número de pieza del fabricante)"',
    'Sexo',
    '"Rango de edad"',
    'Costo',
  ];

  // Envuelve en comillas y escapa comillas internas
  function f(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str) return '';
    return '"' + str.replace(/"/g, '""') + '"';
  }

  // Precio formato TN: 1,615,050.00 (coma miles, punto decimal)
  function formatPrecio(value) {
    if (!value && value !== 0) return '';
    const num = parseFloat(String(value).replace(/,/g, '')) || 0;
    if (num === 0) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Número simple para dimensiones
  function n(value) {
    if (!value && value !== 0) return '';
    const num = parseFloat(String(value).replace(',', '.'));
    return isNaN(num) ? '' : String(num);
  }

  const rows = productos.map(p => {
    const e = p._enriched || {};

    const precioRaw = p.PRECIO || p.precio || p.Precio || p.PRICE || 0;
    const precio = parseFloat(String(precioRaw).replace(/,/g, '')) || 0;
    const mostrar = precio > 0 ? 'SI' : 'NO';

    const slug     = e.slug          || slugify(p.PRODUCTO || p.producto || '');
    const nombre   = e.nombre_limpio || p.PRODUCTO || p.producto || '';
    const categoria = getCategoriaTN(p, tnCategories);
    const tags     = Array.isArray(e.tags) ? e.tags.join(', ') : (e.tags || '');
    const desc     = e.descripcion_html || '';
    const seoT     = (e.seo_titulo || nombre).substring(0, 70);
    const seoD     = (e.seo_descripcion || '').substring(0, 160);
    const marca    = e.marca || '';
    const mpn      = p['CODIGO EXTERNO'] || p.codigo_externo || '';

    return [
      f(slug),               // Identificador de URL
      f(nombre),             // Nombre
      f(categoria),          // Categorías
      formatPrecio(precio),  // Precio
      '',                    // Precio promocional
      n(e.peso_kg),          // Peso (kg)
      n(e.alto_cm),          // Alto (cm)
      n(e.ancho_cm),         // Ancho (cm)
      n(e.profundidad_cm),   // Profundidad (cm)
      '1',                   // Stock
      f(p.CODIGO || p.codigo || ''), // SKU
      '',                    // Código de barras
      mostrar,               // Mostrar en tienda
      'NO',                  // Envío sin cargo
      f(desc),               // Descripción
      f(tags),               // Tags
      f(seoT),               // Título para SEO
      f(seoD),               // Descripción para SEO
      f(marca),              // Marca
      'SI',                  // Producto Físico
      f(mpn),                // MPN
      '',                    // Sexo
      '',                    // Rango de edad
      '',                    // Costo
    ].join(SEP);
  });

  const csv = "\uFEFF" + HEADERS.join(SEP) + "\n" + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tiendanube_repuestos.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportHistoryTiendaNubeCSV(histProductos) {
  const enriched = histProductos.filter(p => p._enriched);
  if (enriched.length === 0) {
    alert("Este análisis no tiene productos enriquecidos con IA. Volvé a cargar el análisis en el flujo principal y ejecutá el enriquecimiento antes de guardar.");
    return;
  }
  const mapped = enriched.map(p => ({
    CODIGO:        p.codigo    || "",
    PRODUCTO:      p.producto  || "",
    RUBRO:         p.rubro     || "",
    "SUB RUBRO":   p.sub_rubro || "",
    PRECIO:        p.precio    || "",
    _tn_manual:    p.tn_manual || false,
    _categoria:    null,
    _subcategoria: null,
    _enriched:     p._enriched,
  }));
  exportTiendaNubeCSV(mapped);
}
