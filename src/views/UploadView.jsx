import React from "react";
import * as XLSX from "xlsx";
import { C } from "../constants";
import { parseTabular, filtrarPorNivel3, nivel3ConConteos } from "../utils";

function parseXLSX(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      resolve(rows);
    };
    reader.readAsArrayBuffer(file);
  });
}

function leerTexto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => resolve(ev.target.result);
    reader.onerror = () => reject(new Error("No se pudo leer " + file.name));
    reader.readAsText(file);
  });
}

// Columnas que el clasificador necesita para no trabajar a ciegas
const COLUMNAS_CLAVE = ["PRODUCTO", "RUBRO"];

export default function UploadView({ onProductsLoaded, hasActiveSession, correctionsCount = 0, toast = null, tnCategories = [] }) {
  const [pasteData, setPasteData] = React.useState("");
  const [previewProducts, setPreviewProducts] = React.useState([]);
  const [showConfirmOverwrite, setShowConfirmOverwrite] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const pendingProductsRef = React.useRef([]);

  // Filtro por familia: recorta el lote antes de clasificar, para trabajar
  // el catálogo de a una categoría por vez.
  const [nivel3Filtro, setNivel3Filtro] = React.useState("");
  const [todosParseados, setTodosParseados] = React.useState([]);

  // Cada archivo se parsea y se recorta por separado; recién al analizar se
  // unen los sobrevivientes. Así un archivo con otras columnas no contamina
  // el recorte de los demás, y se ve cuál fue.
  const [archivos, setArchivos] = React.useState([]); // [{nombre, filas, faltantes}]
  const [leyendo, setLeyendo] = React.useState(false);

  // Los conteos del selector miran tanto lo pegado como lo subido
  const paraConteos = React.useMemo(
    () => (todosParseados.length ? todosParseados : archivos.flatMap(a => a.filas)),
    [todosParseados, archivos]
  );

  const opcionesNivel3 = React.useMemo(
    () => nivel3ConConteos(tnCategories, paraConteos),
    [tnCategories, paraConteos]
  );

  // Parse paste data dynamically for preview
  React.useEffect(() => {
    if (!pasteData.trim()) {
      setPreviewProducts([]);
      setTodosParseados([]);
      return;
    }
    const parsed = parseTabular(pasteData);
    setTodosParseados(parsed);
    setPreviewProducts(parsed.slice(0, 5));
  }, [pasteData]);

  // yaFiltrado: los archivos ya se recortaron uno por uno (y alguno puede
  // haber entrado entero a propósito). Volver a filtrar acá pisaría esa
  // decisión y sacaría justo las filas que el usuario mandó a entrar igual.
  const handleProductsConfirm = (loadedProducts, yaFiltrado = false) => {
    if (loadedProducts.length === 0) return;

    if (yaFiltrado) {
      if (hasActiveSession) {
        pendingProductsRef.current = loadedProducts;
        setShowConfirmOverwrite(true);
      } else {
        onProductsLoaded(loadedProducts);
      }
      return;
    }

    // Después de cargar, antes de clasificar
    const filtrados = filtrarPorNivel3(loadedProducts, nivel3Filtro);
    if (nivel3Filtro && filtrados.length === 0) {
      toast?.error(`No hay productos de "${nivel3Filtro}" en este archivo.`);
      return;
    }
    if (nivel3Filtro) {
      toast?.info?.(`Filtrado: ${filtrados.length} de ${loadedProducts.length} productos (${nivel3Filtro}).`);
    }
    loadedProducts = filtrados;

    if (hasActiveSession) {
      pendingProductsRef.current = loadedProducts;
      setShowConfirmOverwrite(true);
    } else {
      onProductsLoaded(loadedProducts);
    }
  };

  const handlePasteSubmit = () => {
    const parsed = parseTabular(pasteData);
    if (parsed.length > 0) {
      handleProductsConfirm(parsed);
    } else {
      toast?.error("No se pudieron parsear filas de los datos pegados. Verificá el formato.");
    }
  };

  const handleFileUpload = async (e) => {
    const seleccionados = [...e.target.files];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!seleccionados.length) return;

    setLeyendo(true);
    const nuevos = [];
    for (const file of seleccionados) {
      try {
        let filas;
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          filas = await parseXLSX(file);
        } else {
          filas = parseTabular(await leerTexto(file));
        }

        if (!filas || filas.length === 0) {
          toast?.error(`"${file.name}" no tiene filas reconocibles.`);
          continue;
        }

        // Aviso de cabeceras: parseTabular es genérico por header, así que un
        // archivo sin RUBRO parsea igual y recién se nota en la tabla.
        const cabeceras = Object.keys(filas[0] || {});
        const faltantes = COLUMNAS_CLAVE.filter(c => !cabeceras.includes(c));

        nuevos.push({ nombre: file.name, filas, faltantes });
      } catch (err) {
        toast?.error(`No se pudo leer "${file.name}": ${err.message}`);
      }
    }
    setLeyendo(false);

    if (nuevos.length) {
      setArchivos(prev => [...prev, ...nuevos]);
      toast?.success?.(
        nuevos.length === 1
          ? `"${nuevos[0].nombre}" cargado: ${nuevos[0].filas.length} filas.`
          : `${nuevos.length} archivos cargados.`
      );
    }
  };

  const quitarArchivo = nombre => {
    setArchivos(prev => prev.filter(a => a.nombre !== nombre));
    // Si no, al volver a subir un archivo con el mismo nombre entraría entero
    // sin que nadie lo haya pedido esta vez.
    setSinFiltrar(prev => prev.filter(n => n !== nombre));
  };

  // Archivos que el usuario decidió entrar enteros, salteando el filtro. El
  // filtro es una ayuda, no una aduana: si sabe que ahí hay algo que el filtro
  // no ve, tiene que poder meterlo igual y revisarlo después en la tabla.
  const [sinFiltrar, setSinFiltrar] = React.useState([]);
  const alternarSinFiltrar = nombre => setSinFiltrar(prev =>
    prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]
  );

  // El recorte de cada archivo, por separado
  const recortes = React.useMemo(
    () => archivos.map(a => {
      const entero = sinFiltrar.includes(a.nombre);
      return { ...a, entero, pasan: entero ? a.filas : filtrarPorNivel3(a.filas, nivel3Filtro) };
    }),
    [archivos, nivel3Filtro, sinFiltrar]
  );

  const totalPasan = recortes.reduce((n, r) => n + r.pasan.length, 0);

  // Códigos que aparecen en más de un archivo. No se descartan: el filtro
  // decide qué entra. Pero se avisan, porque dos productos con el mismo
  // CODIGO generan el mismo slug y al importar en Tienda Nube uno pisa al otro.
  const codigosRepetidos = React.useMemo(() => {
    const cuenta = new Map();
    recortes.forEach(r => r.pasan.forEach(p => {
      const cod = String(p.CODIGO || "").trim();
      if (cod) cuenta.set(cod, (cuenta.get(cod) || 0) + 1);
    }));
    return [...cuenta.values()].filter(n => n > 1).length;
  }, [recortes]);

  const handleAnalizarArchivos = () => {
    if (totalPasan === 0) {
      toast?.error(
        nivel3Filtro
          ? `El filtro "${nivel3Filtro}" no encontró nada. Usá "Analizar este archivo entero" o poné "Todos los productos".`
          : "Los archivos no tienen filas para analizar."
      );
      return;
    }
    // Unión de los sobrevivientes: acá recién se convierten en uno solo.
    // Ya vienen recortados archivo por archivo, no se vuelve a filtrar.
    handleProductsConfirm(recortes.flatMap(r => r.pasan), true);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "20px auto", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Filtro por familia. Recorta el lote ANTES de clasificar, para poder
          trabajar el catálogo de a una categoría por vez. Las opciones salen
          de tiendanube_categories, nunca de una lista escrita acá. */}
      {opcionesNivel3.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <label htmlFor="filtro-nivel3" style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>
            Procesar productos de…
          </label>
          <select
            id="filtro-nivel3"
            value={nivel3Filtro}
            onChange={e => setNivel3Filtro(e.target.value)}
            style={{ width: "100%", minHeight: 44, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none" }}
          >
            <option value="">Todos los productos</option>
            {[...new Set(opcionesNivel3.map(o => o.nivel2))].map(nivel2 => (
              // Agrupado por nivel2 porque "Calefones" existe bajo dos de
              // ellos: en una lista plana serían dos opciones idénticas.
              <optgroup key={nivel2} label={nivel2}>
                {opcionesNivel3.filter(o => o.nivel2 === nivel2).map(o => (
                  <option key={nivel2 + o.nivel3} value={o.nivel3}>
                    {o.nivel3}{todosParseados.length > 0 ? ` (${o.total})` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
            {todosParseados.length > 0
              ? "El número es cuántos productos de lo que pegaste caen en cada familia, según su RUBRO."
              : "Pegá o subí los datos y acá vas a ver cuántos productos caen en cada familia."}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 48, display: "block", marginBottom: 12 }}>📤</span>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Cargá tus productos HVAC
        </h2>
        <p style={{ color: C.textMuted, fontSize: 13, maxWidth: 500, margin: "0 auto", lineHeight: 1.6 }}>
          Pegá los datos directamente desde tu planilla de Google Sheets o subí un archivo CSV/TSV. 
          El clasificador procesará las reglas dinámicas al instante.
        </p>
        {correctionsCount > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: C.accent, fontWeight: 600 }}>
            📚 {correctionsCount} correcciones aprendidas sincronizadas y listas
          </div>
        )}
      </div>

      {/* Paste Box */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          📋 Pegar desde Google Sheets o Excel
        </label>
        <textarea
          value={pasteData}
          onChange={e => setPasteData(e.target.value)}
          placeholder="Seleccioná todo en Google Sheets (Ctrl+A), copiá (Ctrl+C) y pegá acá. Detecta tabuladores, comas y punto y coma automáticamente..."
          style={{
            width: "100%",
            minHeight: 140,
            padding: 14,
            borderRadius: 10,
            background: C.bg,
            border: `1px solid ${C.border}`,
            color: C.text,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            resize: "vertical",
            outline: "none",
            lineHeight: 1.6,
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />

        {/* 5 Rows Preview Table */}
        {previewProducts.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
              Preview de datos (Primeras 5 filas):
            </div>
            <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: C.surface2 }}>
                    {Object.keys(previewProducts[0]).map(h => (
                      <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewProducts.map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? "transparent" : `${C.surface2}40` }}>
                      {Object.values(row).map((val, cellIdx) => (
                        <td key={cellIdx} style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, color: C.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          onClick={handlePasteSubmit}
          disabled={!pasteData.trim()}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 20px",
            borderRadius: 10,
            border: "none",
            background: pasteData.trim() ? `linear-gradient(135deg, ${C.accent}, #1d4ed8)` : C.border,
            color: pasteData.trim() ? "#fff" : C.textDim,
            fontSize: 13,
            fontWeight: 600,
            cursor: pasteData.trim() ? "pointer" : "default",
            boxShadow: pasteData.trim() ? "0 4px 6px -1px rgba(37,99,235,0.2)" : "none",
            transition: "all 0.2s",
          }}
        >
          🚀 Analizar y Clasificar Productos
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16, color: C.textDim, fontSize: 12 }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        o alternativamente
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      {/* CSV Drag Drop / Select Box */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          background: C.surface,
          borderRadius: 16,
          border: `2px dashed ${C.border}`,
          padding: "32px 20px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Subir CSV, TSV o Excel (.xlsx)
        </div>
        <div style={{ fontSize: 11, color: C.textMuted }}>
          {leyendo
            ? "Leyendo archivos..."
            : "Podés elegir varios a la vez — se procesa cada uno por separado y se unen al final"}
        </div>
      </div>

      {/* Resumen por archivo: cada uno se recorta solo, y se ve cuánto aporta */}
      {recortes.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>
            {recortes.length} archivo{recortes.length !== 1 ? "s" : ""} · {totalPasan} producto{totalPasan !== 1 ? "s" : ""} para analizar
            {nivel3Filtro ? ` (${nivel3Filtro})` : ""}
          </div>

          {recortes.map(r => (
            <div key={r.nombre} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.nombre}
                </div>
                <div style={{ fontSize: 11, color: r.pasan.length === 0 ? C.warning : C.textDim }}>
                  {r.pasan.length} de {r.filas.length} filas
                  {r.entero ? " — entra entero, sin filtrar" : ""}
                  {r.pasan.length === 0 && nivel3Filtro ? " — el filtro no encontró nada acá" : ""}
                </div>
                {/* El filtro puede equivocarse: nombres raros, rubro vacío, otra
                    forma de escribirlo. Si el usuario sabe que ahí hay algo, lo
                    mete igual en vez de quedarse trabado. */}
                {nivel3Filtro && (
                  <button
                    onClick={() => alternarSinFiltrar(r.nombre)}
                    style={{ marginTop: 4, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: r.entero ? C.accentBg : "transparent", color: r.entero ? C.accent : C.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                  >
                    {r.entero ? "✓ Ignorando el filtro" : "Analizar este archivo entero"}
                  </button>
                )}
                {r.faltantes.length > 0 && (
                  <div style={{ fontSize: 11, color: C.warning }}>
                    ⚠️ Sin columna {r.faltantes.join(" ni ")} — esas filas van a clasificar mal
                  </div>
                )}
              </div>
              <button
                onClick={() => quitarArchivo(r.nombre)}
                aria-label={`Quitar ${r.nombre}`}
                style={{ minWidth: 44, minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 13 }}
              >
                ✕
              </button>
            </div>
          ))}

          {codigosRepetidos > 0 && (
            <div style={{ fontSize: 11, color: C.warning, lineHeight: 1.5 }}>
              ⚠️ {codigosRepetidos} código{codigosRepetidos !== 1 ? "s" : ""} aparece{codigosRepetidos !== 1 ? "n" : ""} en más de un archivo.
              No los descarto, pero al exportar a Tienda Nube van a generar el mismo slug y uno pisa al otro.
            </div>
          )}

          <button
            onClick={handleAnalizarArchivos}
            disabled={leyendo}
            style={{
              width: "100%", minHeight: 48, borderRadius: 10, border: "none",
              background: totalPasan > 0 ? C.accent : C.border,
              color: totalPasan > 0 ? "#fff" : C.textDim,
              fontSize: 14, fontWeight: 700, cursor: leyendo ? "default" : "pointer",
            }}
          >
            🚀 Analizar {totalPasan} producto{totalPasan !== 1 ? "s" : ""} de {recortes.length} archivo{recortes.length !== 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Warning Overwrite Modal */}
      {showConfirmOverwrite && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, width: "100%", maxWidth: 420 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              ⚠️ ¿Descartar sesión activa?
            </div>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 24 }}>
              Tenés un análisis cargado en memoria. Si cargás este nuevo conjunto de productos, los datos actuales se descartarán.
              Asegurate de haber guardado tu análisis actual si lo necesitás.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirmOverwrite(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirmOverwrite(false);
                  onProductsLoaded(pendingProductsRef.current);
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: C.danger,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sí, Cargar y Reemplazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
