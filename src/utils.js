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
    const porKeywords = matchPorKeywords(product.PRODUCTO, tnCategories);
    if (porKeywords) return porKeywords;
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
    const porKeywords = matchPorKeywords(product.PRODUCTO, tnCategories);
    if (porKeywords) return porKeywords;
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
  const { timeout, ...rest } = options;
  try {
    const res = await fetchWithTimeout(url, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(rest.headers || {}),
      },
    }, timeout);
    const data = await res.json().catch(() => ({ error: "Respuesta inválida del servidor" }));
    if (!res.ok) {
      const msg = data.error || data.message || `Error ${res.status}`;
      // El cuerpo del error viaja adjunto: algunos endpoints mandan datos extra
      // (ej. qué proveedor de IA falló) que la UI necesita para ofrecer una salida.
      throw Object.assign(new Error(msg), { payload: data, status: res.status });
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

  // Chequeo de duplicados de slug antes de exportar — Tiendanube rechaza
  // URLs repetidas y hoy no hay ninguna validación acá.
  const slugCounts = {};
  productos.forEach(p => {
    const e = p._enriched || {};
    const slug = e.slug || slugify(p.PRODUCTO || p.producto || '');
    if (!slug) return;
    slugCounts[slug] = (slugCounts[slug] || []).concat(p.CODIGO || p.codigo || '(sin código)');
  });
  const duplicados = Object.entries(slugCounts).filter(([, codigos]) => codigos.length > 1);
  if (duplicados.length > 0) {
    const detalle = duplicados.map(([slug, codigos]) => `  - "${slug}" ← ${codigos.join(', ')}`).join('\n');
    console.warn(`[exportTiendaNubeCSV] ${duplicados.length} slug(s) duplicado(s):\n${detalle}`);
    if (typeof alert === 'function') {
      alert(`Atención: hay ${duplicados.length} identificador(es) de URL duplicado(s). Revisá la consola antes de importar en Tiendanube — un slug repetido pisa el producto anterior.\n\n${detalle}`);
    }
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

/**
 * Devuelve cuántos productos entraron al CSV, o 0 si no salió nada — así quien
 * llama puede avisar el resultado sin volver a filtrar por su cuenta.
 */
export function exportHistoryTiendaNubeCSV(histProductos) {
  const enriched = (histProductos || []).filter(p => p._enriched);
  if (enriched.length === 0) {
    alert(
      "No hay productos enriquecidos para exportar.\n\n" +
      "El CSV de Tienda Nube necesita los datos que genera la IA (nombre limpio, " +
      "categoría, descripción, dimensiones).\n\n" +
      "Qué hacer: 'Retomar en sesión activa' → Exportar → Tienda Nube → Enriquecer, " +
      "y volvé a guardar el análisis.\n\n" +
      "Si filtraste la lista, probá sacando el filtro: puede que los enriquecidos " +
      "queden fuera del recorte."
    );
    return 0;
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
  return mapped.length;
}

/**
 * Exporta las fotos del lote como .zip, nombradas por SKU.
 *
 * Tienda Nube no soporta cargar imágenes por URL dentro del CSV de productos:
 * hace falta una app del marketplace que matchee las fotos por SKU o nombre de
 * archivo. Por eso el export se parte en dos archivos independientes — el CSV
 * sigue siendo solo texto y las imágenes viajan en este zip.
 *
 * No se genera .rar: es un formato propietario que no se puede armar del lado
 * del browser.
 *
 * @param {Array}    productos  los productos del export actual
 * @param {Function} onProgress (hechas, total) para el contador en pantalla
 * @returns {number} cuántas imágenes entraron en el zip
 */
export async function exportImagenesZip(productos, onProgress) {
  const { default: JSZip } = await import("jszip");

  const codigos = [...new Set(
    (productos || []).map(p => String(p.CODIGO || p.codigo || "").trim()).filter(Boolean)
  )];
  if (!codigos.length) return 0;

  // Las fotos se piden en tandas, no una consulta por producto
  const porCodigo = {};
  for (let i = 0; i < codigos.length; i += 100) {
    const tanda = codigos.slice(i, i + 100);
    const filas = await apiFetch(`/api/product-images?codigos=${encodeURIComponent(tanda.join(","))}`);
    (filas || []).forEach(f => {
      if (!porCodigo[f.codigo]) porCodigo[f.codigo] = [];
      porCodigo[f.codigo].push(f);
    });
  }

  const pendientes = [];
  Object.keys(porCodigo).forEach(codigo => {
    const fotos = porCodigo[codigo];
    const base = codigo.replace(/[^a-zA-Z0-9._-]/g, "-");
    fotos.forEach((foto, idx) => {
      const ext = (foto.url.split("?")[0].split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      // Una sola foto → {codigo}.jpg; varias → {codigo}-1.jpg, {codigo}-2.jpg
      const nombre = fotos.length === 1 ? `${base}.${ext}` : `${base}-${idx + 1}.${ext}`;
      pendientes.push({ nombre, url: foto.url });
    });
  });

  // Cuántos productos aportaron al menos una foto — es el "de M productos"
  // del aviso final, y no es lo mismo que la cantidad de imágenes.
  const productosConFoto = Object.keys(porCodigo).filter(c => porCodigo[c].length > 0).length;

  if (!pendientes.length) return { imagenes: 0, productos: 0 };

  const zip = new JSZip();
  let hechas = 0;

  // Secuencial a propósito: en paralelo, un lote de fotos de 4MB revienta la
  // memoria del Safari de un iPhone.
  for (const item of pendientes) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zip.file(item.nombre, await res.blob());
    } catch (e) {
      console.error("[zip] no se pudo bajar", item.nombre, e.message);
    }
    hechas++;
    if (onProgress) onProgress(hechas, pendientes.length);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Con fecha en el nombre, dos lotes exportados el mismo día no se pisan en
  // la carpeta de descargas ni hay que adivinar cuál era cuál.
  const fecha = new Date().toISOString().slice(0, 10);
  a.download = `fullcalor-imagenes-${fecha}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return { imagenes: pendientes.length, productos: productosConFoto };
}

/* ──────────────────────────────────────────────────────────────────────────
   Filtro por nivel3 — para trabajar el catálogo familia por familia.

   Matchea contra RUBRO y SUB RUBRO, que son las categorías del PROVEEDOR, no
   las de Tienda Nube. Es a propósito: el filtro corre antes de clasificar,
   cuando la categoría TN todavía no existe. Y es la señal correcta — de los
   164 productos con rubro CALDERAS, 112 no tienen la palabra "caldera" en el
   nombre, así que filtrar por nombre perdería el 68%.

   Los nombres de nivel3 salen de tiendanube_categories, nunca del código.
   ────────────────────────────────────────────────────────────────────────── */

export function normalizarTexto(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// ── Comparación de categorías, ciega a acentos ───────────────────────────────
// "Calefaccion" y "Calefacción" son la MISMA categoría, y lo mismo pasa con
// Hidráulicos, Electrónica, Válvulas, Manómetros. La IA a veces escribe sin
// tildes y un INSERT a mano también; comparadas tal cual se crea una rama
// paralela en el árbol. Espeja normNivel/normPath de api/_helpers.js.
export function normNivel(txt) {
  return normalizarTexto(txt).replace(/\s+/g, " ").trim();
}

export function normPath(path) {
  return (path || "").split(">").map(normNivel).filter(Boolean).join(" > ");
}

/**
 * Mejor categoría según las keywords de la tabla. Normaliza los DOS lados: las
 * keywords llevan acentos ("válvula llenado") y los nombres de producto casi
 * nunca ("VALVULA DE SEGURIDAD"), así que sin esto no matcheaban.
 */
export function matchPorKeywords(nombreProducto, tnCategories = []) {
  const nombre = normNivel(nombreProducto);
  if (!nombre) return null;
  let bestMatch = null;
  let bestScore = 0;
  tnCategories.forEach(cat => {
    if (!cat.keywords) return;
    const kws = cat.keywords.split(",").map(k => normNivel(k));
    const score = kws.filter(kw => kw && nombre.includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestMatch = cat; }
  });
  if (!bestMatch) return null;
  return [bestMatch.nivel1, bestMatch.nivel2, bestMatch.nivel3, bestMatch.nivel4]
    .filter(Boolean).join(" > ");
}

// Palabras que no aportan al match y darían falsos positivos por sí solas
const PALABRAS_VACIAS = new Set(["y", "de", "a", "del", "la", "el", "los", "las", "para", "con"]);

/**
 * ¿Este producto pertenece a ese nivel3?
 *
 * Compara las palabras significativas del nombre del nivel3 contra el rubro y
 * el sub rubro. Así "Bombas y Presurizadoras" matchea el rubro "BOMBAS", y
 * "Salamandras" matchea "VARIOS SALAMANDRAS", sin una sola categoría escrita
 * en el código.
 */
// Las categorías están en plural ("Calderas", "Radiadores") y los productos en
// singular ("CALDERA MURAL"). Medido sobre el catálogo real: buscar "calderas"
// encuentra 3 nombres, buscar "caldera" encuentra 59; "radiadores" encuentra 0
// y "radiador" encuentra 3. Sin esto, mirar el nombre no serviría de nada.
function raiz(palabra) {
  if (palabra.length > 4 && palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.length > 3 && palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

export function coincideNivel3(producto, nivel3) {
  if (!nivel3) return true; // "Todos"

  const palabras = normalizarTexto(nivel3)
    .split(/\s+/)
    .filter(p => p.length > 2 && !PALABRAS_VACIAS.has(p))
    .map(raiz);
  if (!palabras.length) return false;

  // Se mira también el NOMBRE, no solo la clasificación del proveedor: hay
  // archivos sin columna RUBRO, o con el rubro escrito de otra forma, donde el
  // único lugar donde dice "caldera" es el nombre del producto. Es un filtro
  // generoso a propósito — de más entra y se revisa en la tabla; de menos se
  // pierde sin que nadie se entere.
  const donde = [
    producto.PRODUCTO || producto.producto,
    producto.RUBRO || producto.rubro,
    producto["SUB RUBRO"] || producto.sub_rubro,
  ].map(normalizarTexto).join(" ");

  return palabras.some(p => donde.includes(p));
}

export function filtrarPorNivel3(productos, nivel3) {
  if (!nivel3) return productos || [];
  return (productos || []).filter(p => coincideNivel3(p, nivel3));
}

/**
 * Los nivel3 disponibles, agrupados por nivel2 y con cuántos productos del
 * lote caen en cada uno. El conteo es lo que evita el callejón sin salida:
 * ves "Estufas a Pellet (0)" antes de elegirlo, en vez de después.
 */
export function nivel3ConConteos(tnCategories, productos) {
  const vistos = new Map(); // "nivel2|nivel3" → {nivel2, nivel3, total}

  (tnCategories || []).forEach(c => {
    if (c.activa === false || !c.nivel2 || !c.nivel3) return;
    const clave = c.nivel2 + "|" + c.nivel3;
    if (vistos.has(clave)) return;
    vistos.set(clave, {
      nivel2: c.nivel2,
      nivel3: c.nivel3,
      total: (productos || []).filter(p => coincideNivel3(p, c.nivel3)).length,
    });
  });

  return [...vistos.values()].sort(
    (a, b) => a.nivel2.localeCompare(b.nivel2) || a.nivel3.localeCompare(b.nivel3)
  );
}
