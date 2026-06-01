import React from "react";
import * as XLSX from "xlsx";
import { C } from "../constants";
import { parseTabular } from "../utils";

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

export default function UploadView({ onProductsLoaded, hasActiveSession, correctionsCount = 0, toast = null }) {
  const [pasteData, setPasteData] = React.useState("");
  const [previewProducts, setPreviewProducts] = React.useState([]);
  const [showConfirmOverwrite, setShowConfirmOverwrite] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const pendingProductsRef = React.useRef([]);

  // Parse paste data dynamically for preview
  React.useEffect(() => {
    if (!pasteData.trim()) {
      setPreviewProducts([]);
      return;
    }
    const parsed = parseTabular(pasteData);
    setPreviewProducts(parsed.slice(0, 5));
  }, [pasteData]);

  const handleProductsConfirm = (loadedProducts) => {
    if (loadedProducts.length === 0) return;
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
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const data = await parseXLSX(file);
      if (data.length > 0) {
        handleProductsConfirm(data);
      } else {
        toast?.error("El archivo Excel no contiene filas válidas.");
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseTabular(ev.target.result);
        if (parsed.length > 0) {
          handleProductsConfirm(parsed);
        } else {
          toast?.error("El archivo no contiene columnas reconocidas (CODIGO, PRODUCTO, RUBRO).");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="fade-in" style={{ maxWidth: 760, margin: "20px auto", display: "flex", flexDirection: "column", gap: 24 }}>
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
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />
        <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Subir CSV, TSV o Excel (.xlsx)
        </div>
        <div style={{ fontSize: 11, color: C.textMuted }}>
          Delimitados por coma, punto y coma, tabulación — o planilla Excel
        </div>
      </div>

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
