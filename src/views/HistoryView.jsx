import React, { useState, useMemo } from "react";
import { C } from "../constants";
import { fmtDate } from "../utils";

export default function HistoryView({
  historyList,
  onLoadDetail,
  onRename,
  onDelete,
  onDuplicate,
  loading
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, WEEK, MONTH
  
  // Renaming state
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState("");

  // Compare state
  const [compareIds, setCompareIds] = useState([]);

  // Date filter logic
  const filteredHistory = useMemo(() => {
    return historyList.filter(a => {
      // Search
      if (searchTerm && !a.nombre.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Date limits
      if (dateFilter !== "ALL") {
        const createdDate = new Date(a.created_at);
        const now = new Date();
        const diffTime = Math.abs(now - createdDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (dateFilter === "TODAY" && diffDays > 1) return false;
        if (dateFilter === "WEEK" && diffDays > 7) return false;
        if (dateFilter === "MONTH" && diffDays > 30) return false;
      }
      
      return true;
    });
  }, [historyList, searchTerm, dateFilter]);

  const handleRenameSubmit = (id) => {
    if (!renameText.trim()) return;
    onRename(id, renameText);
    setRenamingId(null);
  };

  const handleToggleCompare = (id) => {
    setCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) {
        // limit to 2
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  // Compare results calculated client-side
  const comparisonResults = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = historyList.find(x => x.id === compareIds[0]);
    const b = historyList.find(x => x.id === compareIds[1]);
    if (!a || !b) return null;
    
    return {
      a,
      b,
      totalDiff: b.total - a.total,
      repuestosDiff: b.repuestos - a.repuestos,
      accesoriosDiff: b.accesorios - a.accesorios,
      completosDiff: b.completos - a.completos,
      aprendidosDiff: b.aprendidos - a.aprendidos,
    };
  }, [compareIds, historyList]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            🗂 Historial de Análisis guardados
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Visualizá, compará y cargá de vuelta análisis de productos pasados sincronizados con Supabase.
          </p>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nombre del análisis..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", width: 220 }}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "ALL", label: "Cualquier fecha" },
            { id: "TODAY", label: "Hoy" },
            { id: "WEEK", label: "Esta semana" },
            { id: "MONTH", label: "Este mes" },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setDateFilter(opt.id)}
              style={{
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${dateFilter === opt.id ? C.accent : C.border}`,
                background: dateFilter === opt.id ? C.accentBg : "transparent",
                color: dateFilter === opt.id ? C.accent : C.textMuted,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {compareIds.length > 0 && (
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.accent, fontWeight: 600 }}>
            {compareIds.length === 1 ? "Seleccioná 1 análisis más para comparar" : "¡Comparación lista abajo!"}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textMuted }}>
          <span style={{ display: "block", fontSize: 24, animation: "pulse 1.5s infinite" }}>⏳</span>
          Cargando historial...
        </div>
      )}

      {/* History Grid */}
      {!loading && filteredHistory.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, color: C.textDim }}>
          <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>📂</span>
          No tenés análisis guardados en este período.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filteredHistory.map(a => {
            const isComparing = compareIds.includes(a.id);
            const isRenaming = renamingId === a.id;

            return (
              <div
                key={a.id}
                style={{
                  background: C.surface,
                  border: `1px solid ${isComparing ? C.accent : C.border}`,
                  borderRadius: 14,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    {isRenaming ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          value={renameText}
                          onChange={e => setRenameText(e.target.value)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", flex: 1 }}
                        />
                        <button onClick={() => handleRenameSubmit(a.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>OK</button>
                        <button onClick={() => setRenamingId(null)} style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}>✕</button>
                      </div>
                    ) : (
                      <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{a.nombre}</h4>
                    )}
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{fmtDate(a.created_at)}</div>
                  </div>
                  
                  {/* Actions Dropdown / row */}
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => onLoadDetail(a.id)}
                      style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.accentBg, color: C.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                    >
                      Ver
                    </button>
                    <button
                      onClick={() => { setRenamingId(a.id); setRenameText(a.nombre); }}
                      style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => onDelete(a.id)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.danger}40`, background: "transparent", color: C.danger, fontSize: 11, cursor: "pointer" }}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Analysis stats inside card */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: C.surface2, borderRadius: 10, padding: 12, fontSize: 12 }}>
                  <div>Total: <strong>{a.total}</strong></div>
                  <div style={{ color: "#d97706" }}>⚙️ Repuestos: <strong>{a.repuestos}</strong></div>
                  <div style={{ color: "#7c3aed" }}>🔩 Accesorios: <strong>{a.accesorios}</strong></div>
                  <div style={{ color: "#06b6d4" }}>📚 Aprendidos: <strong>{a.aprendidos}</strong></div>
                </div>

                {/* Compare Checkbox */}
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textMuted, cursor: "pointer", alignSelf: "flex-start", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={isComparing}
                    onChange={() => handleToggleCompare(a.id)}
                  />
                  Comparar este análisis
                </label>
              </div>
            );
          })}
        </div>
      )}

      {/* COMPARATIVE RESULTS DRAW PANEL */}
      {comparisonResults && (
        <div className="fade-in" style={{ background: C.surface, border: `2px solid ${C.accent}`, borderRadius: 16, padding: 24, marginTop: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            📊 Comparación: {comparisonResults.a.nombre} vs {comparisonResults.b.nombre}
          </h3>
          <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>
            Visualizá los cambios en la distribución y tamaño de tu catálogo entre ambos guardados.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
            {[
              { label: "Total Catálogo", diff: comparisonResults.totalDiff, unit: "ítems" },
              { label: "⚙️ Repuestos", diff: comparisonResults.repuestosDiff, unit: "repuestos" },
              { label: "🔩 Accesorios", diff: comparisonResults.accesoriosDiff, unit: "accesorios" },
              { label: "📦 Productos Completos", diff: comparisonResults.completosDiff, unit: "completos" },
              { label: "📚 Aprendidos", diff: comparisonResults.aprendidosDiff, unit: "aprendidos" },
            ].map(r => {
              const isPos = r.diff > 0;
              const isZero = r.diff === 0;
              return (
                <div key={r.label} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isZero ? C.text : isPos ? C.success : C.danger, marginTop: 4 }}>
                    {isZero ? "±0" : isPos ? `+${r.diff}` : r.diff}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{r.unit} de diferencia</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
