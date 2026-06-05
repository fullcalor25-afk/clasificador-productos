import React, { useState, useMemo } from "react";
import { C, CLS, CLS_COLORS } from "../constants";
import ClassificationBadge from "../components/ClassificationBadge";
import Pagination from "../components/Pagination";
import { exportHistoryCSV, exportHistoryTiendaNubeCSV } from "../utils";

export default function HistoryDetailView({
  historyDetail,
  onGoBack,
  onLoadIntoActiveSession,
  onUpdateHistoryClass
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingId, setEditingId] = useState(null);

  const products = historyDetail ? (historyDetail.products || []) : [];

  // Filter logic
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Class filter
      if (filter !== "ALL") {
        if (p.clasificacion !== filter) return false;
      }

      // Text search
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          (p.producto || "").toLowerCase().includes(s) ||
          (p.codigo || "").toLowerCase().includes(s) ||
          (p.rubro || "").toLowerCase().includes(s)
        );
      }

      return true;
    });
  }, [products, filter, searchTerm]);

  // Page split
  const pagedProducts = useMemo(() => {
    const start = page * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize);

  const handleExportCSV = () => {
    const hasEnriched = products.some(p => p._enriched);
    exportHistoryCSV(products, hasEnriched);
  };

  const handleExportTiendaNube = () => {
    exportHistoryTiendaNubeCSV(products);
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={onGoBack}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.textMuted,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Volver
        </button>
        
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
            {historyDetail.nombre}
          </h2>
          <div style={{ fontSize: 12, color: C.textDim }}>
            Análisis guardado en Supabase
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onLoadIntoActiveSession(historyDetail)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔄 Retomar en sesión activa
          </button>
          
          <button
            onClick={handleExportCSV}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: `${C.success}15`,
              border: `1px solid ${C.success}`,
              color: C.success,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📥 Descargar CSV
          </button>

          {products.some(p => p._enriched) && (
            <button
              onClick={handleExportTiendaNube}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid #10b981",
                color: "#10b981",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🛒 CSV Tienda Nube
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        {[
          { label: "Total", value: historyDetail.total || 0, color: C.accent, icon: "📊" },
          { label: "Repuestos", value: historyDetail.repuestos || 0, color: "#f59e0b", icon: "⚙️" },
          { label: "Accesorios", value: historyDetail.accesorios || 0, color: "#8b5cf6", icon: "🔩" },
          { label: "Completos", value: historyDetail.completos || 0, color: "#10b981", icon: "📦" },
          { label: "Aprendidos", value: historyDetail.aprendidos || 0, color: "#06b6d4", icon: "📚" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase" }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
        <input
          type="text"
          placeholder="🔍 Buscar en este historial..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", flex: 1 }}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {["ALL", "REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO", "OTRO"].map(f => {
            const isAct = filter === f;
            const lbl = f === "ALL" ? "Todos" : CLS[f]?.label || f;
            const color = f === "ALL" ? C.accent : CLS[f]?.color;
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(0); }}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${isAct ? color : C.border}`,
                  background: isAct ? `${color}15` : "transparent",
                  color: isAct ? color : C.textMuted,
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table grid */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Código</th>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Producto</th>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Rubro</th>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Clasificación</th>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Categoría TN</th>
                <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Fuente</th>
                <th style={{ padding: "10px 14px", textAlign: "center", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>
                    Sin coincidencias.
                  </td>
                </tr>
              ) : (
                pagedProducts.map((p, idx) => {
                  const isManual = p.fuente === "APRENDIDO";
                  const cfg = CLS[p.clasificacion] || CLS.OTRO;
                  const hasTN = !!p._enriched;

                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                        {p.codigo}
                      </td>
                      <td style={{ padding: "8px 14px", fontWeight: 600, color: C.text }}>
                        {p.producto}
                        {hasTN && <span style={{ color: C.success, fontSize: 11, marginLeft: 6 }} title="Enriquecido ✓">✓</span>}
                      </td>
                      <td style={{ padding: "8px 14px", color: C.textMuted }}>
                        <div>{p.rubro || "—"}</div>
                        {p.sub_rubro && <div style={{ fontSize: 11, color: C.textDim }}>{p.sub_rubro}</div>}
                      </td>
                      <td style={{ padding: "8px 14px" }}>
                        {editingId === p.id ? (
                          <select
                            value={p.clasificacion}
                            onChange={e => {
                              onUpdateHistoryClass(p.id, e.target.value);
                              setEditingId(null);
                            }}
                            style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.surface, color: C.text, fontSize: 12, outline: "none" }}
                          >
                            {Object.keys(CLS).map(k => (
                              <option key={k} value={k}>{CLS[k].label}</option>
                            ))}
                          </select>
                        ) : (
                          <ClassificationBadge
                            classification={p.clasificacion}
                            source={p.fuente}
                            isManual={isManual}
                            confidence={p.confianza}
                          />
                        )}
                      </td>
                      {/* CATEGORÍA TN */}
                      <td style={{ padding: "8px 14px", maxWidth: 220 }}>
                        {p.categoria_tiendanube ? (() => {
                          const parts = p.categoria_tiendanube.split(" > ");
                          return (
                            <span style={{ fontSize: 11 }}>
                              {parts.map((part, i) => (
                                <React.Fragment key={i}>
                                  {i > 0 && <span style={{ color: C.textDim, margin: "0 2px", fontSize: 10 }}>›</span>}
                                  {i === parts.length - 1
                                    ? <strong style={{ color: p.tn_manual ? C.accent : C.text }}>{part}</strong>
                                    : <span style={{ color: C.textMuted }}>{part}</span>
                                  }
                                </React.Fragment>
                              ))}
                              {p.tn_manual && <span style={{ marginLeft: 4, fontSize: 10, color: C.accent }} title="Corregido manualmente">✎</span>}
                            </span>
                          );
                        })() : <span style={{ color: C.textDim }}>—</span>}
                      </td>
                      <td style={{ padding: "8px 14px", fontSize: 11 }}>
                        <span style={{ fontWeight: 600, color: isManual ? C.accent : p.fuente === "IA" ? C.success : C.textDim }}>
                          {p.fuente || "REGLAS"}
                        </span>
                        <div style={{ fontSize: 11, color: C.textDim }}>{p.confianza}%</div>
                      </td>
                      <td style={{ padding: "8px 14px", textAlign: "center" }}>
                        <button
                          onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                          style={{ background: "transparent", border: `1px solid ${C.border}`, padding: "4px 8px", borderRadius: 6, color: C.textMuted, cursor: "pointer", fontSize: 11 }}
                        >
                          {editingId === p.id ? "✕" : "✏️"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={size => {
            setPageSize(size);
            setPage(0);
          }}
          totalItems={filteredProducts.length}
        />
      </div>

    </div>
  );
}
