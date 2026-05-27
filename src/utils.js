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

export function buildCategoriaTN(product) {
  const MAP = {
    "Calefacción":    "Repuestos > Calefacción",
    "Refrigeración":  "Repuestos > Refrigeración",
    "Gas y Agua":     "Repuestos > Gas y Agua",
    "Agua Sanitaria": "Repuestos > Agua Sanitaria",
    "Herramientas":   "Herramientas",
  };
  const base = MAP[product._categoria] || "Repuestos";
  return product._subcategoria ? base + " > " + product._subcategoria : base;
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

export function exportCSV(toExport, CLS) {
  if (toExport.length === 0) return alert("No hay productos para exportar.");

  const headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "PROVEEDOR", "CLASIFICACION", "CONFIANZA", "FUENTE", "RAZONES", "CATEGORIA", "SUBCATEGORIA", "TIPO"];
  const rows = toExport.map(p => [
    p.CODIGO || "",
    '"' + (p.PRODUCTO || "").replace(/"/g, '""') + '"',
    p.RUBRO || "",
    p["SUB RUBRO"] || "",
    '"' + (p.PROVEEDOR || "").replace(/"/g, '""') + '"',
    p._manualClass || p._class.classification,
    (p._class.confidence || 0) + "%",
    p._manualClass ? "APRENDIDO" : (p._source || "REGLAS"),
    '"' + (p._class.reasons || []).join("; ").replace(/"/g, '""') + '"',
    p._categoria || "",
    p._subcategoria || "",
    p._tipo || "",
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
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
        p.codigo || "",
        '"' + (p.producto || "").replace(/"/g, '""') + '"',
        p.rubro || "",
        p.sub_rubro || "",
        p.clasificacion || "",
        p.fuente || "",
        (p.confianza || 0) + "%",
        e.slug || "",
        '"' + (e.nombre_limpio || "").replace(/"/g, '""') + '"',
        e.marca || "",
        '"' + (e.descripcion_html || "").replace(/"/g, '""') + '"',
        '"' + (Array.isArray(e.tags) ? e.tags.join(",") : (e.tags || "")) + '"',
        '"' + (e.seo_titulo || "").replace(/"/g, '""') + '"',
        '"' + (e.seo_descripcion || "").replace(/"/g, '""') + '"',
        e.peso_kg || "",
        e.alto_cm || "",
        e.ancho_cm || "",
        e.profundidad_cm || "",
        e.categoria_tiendanube || ""
      ];
    });
  } else {
    headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "CLASIFICACION", "FUENTE", "CONFIANZA"];
    rows = productos.map(p => [
      p.codigo || "",
      '"' + (p.producto || "").replace(/"/g, '""') + '"',
      p.rubro || "",
      p.sub_rubro || "",
      p.clasificacion || "",
      p.fuente || "",
      (p.confianza || 0) + "%",
    ]);
  }
  
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
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

export function exportTiendaNubeCSV(productos) {
  const HEADERS = [
    '"Identificador de URL"', "Nombre", "Categorías", "Precio",
    '"Precio promocional"', '"Peso (kg)"', '"Alto (cm)"', '"Ancho (cm)"',
    '"Profundidad (cm)"', "Stock", "SKU", '"Código de barras"',
    '"Mostrar en tienda"', '"Envío sin cargo"', "Descripción", "Tags",
    '"Título para SEO"', '"Descripción para SEO"', "Marca",
    '"Producto Físico"', '"MPN (Número de pieza del fabricante)"',
    "Sexo", '"Rango de edad"', "Costo"
  ];

  // Retrieve customized defaults from localStorage if set (Bug 1 & SettingsView)
  const defaultStock = localStorage.getItem("tn_default_stock") || "1";
  const defaultShowNoPrice = localStorage.getItem("tn_show_no_price") || "NO";
  const skuPrefix = localStorage.getItem("tn_sku_prefix") || "";

  const rows = productos.map(p => {
    const e = p._enriched || {};
    const precio = getProductPrice(p);
    const mostrar = precio > 0 ? "SI" : defaultShowNoPrice;
    const slug = e.slug || slugify(p.PRODUCTO || p.producto || "");
    const nombre = e.nombre_limpio || p.PRODUCTO || p.producto || "";
    const categoria = e.categoria_tiendanube || buildCategoriaTN(p);
    const tags = Array.isArray(e.tags) ? e.tags.join(", ") : (e.tags || "");
    const desc = e.descripcion_html || "";
    const seoT = e.seo_titulo || nombre.substring(0, 70);
    const seoD = e.seo_descripcion || "";
    const marca = e.marca || "";
    const sku = p.CODIGO || p.codigo || "";
    const finalSku = sku ? `${skuPrefix}${sku}` : "";
    const mpn = p["CODIGO EXTERNO"] || p.codigo_externo || "";

    return [
      slug,
      `"${nombre.replace(/"/g, '""')}"`,
      `"${categoria}"`,
      precio > 0 ? precio.toFixed(2).replace(".", ",") : "",
      "",
      e.peso_kg !== undefined && e.peso_kg !== null ? e.peso_kg : "", 
      e.alto_cm !== undefined && e.alto_cm !== null ? e.alto_cm : "", 
      e.ancho_cm !== undefined && e.ancho_cm !== null ? e.ancho_cm : "", 
      e.profundidad_cm !== undefined && e.profundidad_cm !== null ? e.profundidad_cm : "",
      defaultStock,
      finalSku,
      "",
      mostrar,
      "NO",
      `"${desc.replace(/"/g, '""')}"`,
      `"${tags}"`,
      `"${seoT.replace(/"/g, '""')}"`,
      `"${seoD.replace(/"/g, '""')}"`,
      marca,
      "SI",
      mpn,
      "", "", ""
    ].join(";");
  });

  const csv = [HEADERS.join(";"), ...rows].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
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
    codigo: p.codigo || "",
    CODIGO: p.codigo || "",
    PRODUCTO: p.producto || "",
    producto: p.producto || "",
    rubro: p.rubro || "",
    RUBRO: p.rubro || "",
    "SUB RUBRO": p.sub_rubro || "",
    sub_rubro: p.sub_rubro || "",
    _categoria: null,
    _subcategoria: null,
    _enriched: p._enriched,
  }));
  exportTiendaNubeCSV(mapped);
}
