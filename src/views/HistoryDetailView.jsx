import React, { useState, useMemo, useEffect } from "react";
import { C, CLS, CLS_COLORS } from "../constants";
import ClassificationBadge from "../components/ClassificationBadge";
import Pagination from "../components/Pagination";
import ProductPhotosModal, { contarSinConfirmar } from "../components/ProductPhotosModal";
import useIsNarrow from "../hooks/useIsNarrow";
import { exportHistoryCSV, exportHistoryTiendaNubeCSV, apiFetch } from "../utils";

export default function HistoryDetailView({
  historyDetail,
  onGoBack,
  onLoadIntoActiveSession,
  onUpdateHistoryClass,
  toast
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingId, setEditingId] = useState(null);
  const [fotosPorCodigo, setFotosPorCodigo] = useState({});
  const [modalProducto, setModalProducto] = useState(null);

  // Rango iPhone: acá la tabla pasa a tarjetas y los botones a targets de dedo.
  const isNarrow = useIsNarrow(430);

  const products = historyDetail ? (historyDetail.products || []) : [];

  // Las fotos se piden en tandas por código, no una consulta por producto.
  useEffect(() => {
    const codigos = [...new Set(products.map(p => (p.codigo || "").trim()).filter(Boolean))];
    if (!codigos.length) return;

    let cancelado = false;
    (async () => {
      const mapa = {};
      for (let i = 0; i < codigos.length; i += 100) {
        const tanda = codigos.slice(i, i + 100);
        try {
          const filas = await apiFetch(`/api/product-images?codigos=${encodeURIComponent(tanda.join(","))}`);
          (filas || []).forEach(f => {
            if (!mapa[f.codigo]) mapa[f.codigo] = [];
            mapa[f.codigo].push(f);
          });
        } catch {
          // Sin fotos no se rompe el detalle: simplemente no se muestran badges.
          return;
        }
      }
      if (!cancelado) setFotosPorCodigo(mapa);
    })();

    return () => { cancelado = true; };
  }, [historyDetail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fotosDe = codigo => fotosPorCodigo[(codigo || "").trim()] || [];

  const productosConFoto = useMemo(
    () => products.filter(p => fotosDe(p.codigo).length > 0).length,
    [products, fotosPorCodigo] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleFotosChange = (codigo, fotos) => {
    setFotosPorCodigo(prev => ({ ...prev, [(codigo || "").trim()]: fotos }));
  };

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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: isNarrow ? "100%" : undefined }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 100%), 1fr))", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
        {[
          { label: "Total", value: historyDetail.total || 0, color: C.accent, icon: "📊" },
          { label: "Repuestos", value: historyDetail.repuestos || 0, color: "#f59e0b", icon: "⚙️" },
          { label: "Accesorios", value: historyDetail.accesorios || 0, color: "#8b5cf6", icon: "🔩" },
          { label: "Completos", value: historyDetail.completos || 0, color: "#10b981", icon: "📦" },
          { label: "Aprendidos", value: historyDetail.aprendidos || 0, color: "#06b6d4", icon: "📚" },
          { label: "Con foto", value: productosConFoto, total: products.length, color: "#ec4899", icon: "📷" },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase" }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>
              {s.value.toLocaleString()}
              {s.total !== undefined && <span style={{ fontSize: 13, color: C.textDim }}>/{s.total}</span>}
            </div>
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
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", flex: 1, minWidth: 180 }}
        />

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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

      {/* Listado de productos */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        {isNarrow ? (
          /* Pantalla angosta: tarjetas apiladas, sin scroll horizontal */
          <div style={{ display: "flex", flexDirection: "column" }}>
            {pagedProducts.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>Sin coincidencias.</div>
            ) : pagedProducts.map(p => {
              const isManual = p.fuente === "APRENDIDO";
              const fotos = fotosDe(p.codigo);
              const sinConfirmar = contarSinConfirmar(fotos);

              return (
                <div key={p.id} style={{ padding: 14, borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                    {p.codigo || "—"}
                  </div>
                  <div style={{ fontWeight: 600, color: C.text, fontSize: 14, lineHeight: 1.35 }}>
                    {p.producto}
                    {p._enriched && <span style={{ color: C.success, fontSize: 12, marginLeft: 6 }} title="Enriquecido">✓</span>}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {editingId === p.id ? (
                      <select
                        value={p.clasificacion}
                        onChange={e => { onUpdateHistoryClass(p.id, e.target.value); setEditingId(null); }}
                        style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.surface, color: C.text, outline: "none" }}
                      >
                        {Object.keys(CLS).map(k => <option key={k} value={k}>{CLS[k].label}</option>)}
                      </select>
                    ) : (
                      <ClassificationBadge
                        classification={p.clasificacion}
                        source={p.fuente}
                        isManual={isManual}
                        confidence={p.confianza}
                      />
                    )}
                    <span style={{ fontSize: 11, color: C.textDim }}>{p.rubro || "—"}</span>
                  </div>

                  {p.categoria_tiendanube && (
                    <div style={{ fontSize: 11, color: C.textMuted }}>
                      {p.categoria_tiendanube}
                      {p.tn_manual && <span style={{ marginLeft: 4, color: C.accent }} title="Corregido manualmente">✎</span>}
                    </div>
                  )}

                  <FotosBadge fotos={fotos} sinConfirmar={sinConfirmar} />

                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setModalProducto(p)} style={accionStyle(C.accent, true)}>
                      📷 {fotos.length > 0 ? "Fotos" : "Agregar fotos"}
                    </button>
                    <button onClick={() => setEditingId(editingId === p.id ? null : p.id)} style={accionStyle(C.textMuted, false)}>
                      {editingId === p.id ? "✕ Cancelar" : "✏️ Clasificación"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                  {["Código", "Producto", "Rubro", "Clasificación", "Categoría TN", "Fuente"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                  ))}
                  <th style={{ padding: "10px 14px", textAlign: "center", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Fotos</th>
                  <th style={{ padding: "10px 14px", textAlign: "center", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>
                      Sin coincidencias.
                    </td>
                  </tr>
                ) : (
                  pagedProducts.map(p => {
                    const isManual = p.fuente === "APRENDIDO";
                    const hasTN = !!p._enriched;
                    const fotos = fotosDe(p.codigo);
                    const sinConfirmar = contarSinConfirmar(fotos);

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
                            onClick={() => setModalProducto(p)}
                            title={fotos.length ? "Ver fotos del producto" : "Agregar fotos"}
                            style={{ minWidth: 44, minHeight: 44, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, cursor: "pointer", fontSize: 13 }}
                          >
                            📷
                          </button>
                          <div style={{ marginTop: 2 }}>
                            <FotosBadge fotos={fotos} sinConfirmar={sinConfirmar} compacto />
                          </div>
                        </td>
                        <td style={{ padding: "8px 14px", textAlign: "center" }}>
                          <button
                            onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                            style={{ minWidth: 44, minHeight: 44, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.textMuted, cursor: "pointer", fontSize: 13 }}
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
        )}

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

      <ProductPhotosModal
        isOpen={!!modalProducto}
        producto={modalProducto}
        fotosIniciales={modalProducto ? fotosDe(modalProducto.codigo) : []}
        onFotosChange={handleFotosChange}
        onClose={() => setModalProducto(null)}
        toast={toast}
      />
    </div>
  );
}

/** "2 fotos sin confirmar" / "1 foto ✓" — lo que se ve de un vistazo en la lista. */
function FotosBadge({ fotos, sinConfirmar, compacto = false }) {
  if (!fotos.length) return null;

  const pendiente = sinConfirmar > 0;
  const texto = pendiente
    ? `${sinConfirmar} ${sinConfirmar === 1 ? "foto" : "fotos"} sin confirmar`
    : `${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"} ✓`;

  return (
    <span
      title={texto}
      style={{
        display: "inline-block",
        alignSelf: "flex-start",
        padding: compacto ? "1px 5px" : "3px 8px",
        borderRadius: 6,
        fontSize: compacto ? 9 : 11,
        fontWeight: 700,
        background: pendiente ? `${C.warning}18` : `${C.success}18`,
        color: pendiente ? C.warning : C.success,
      }}
    >
      {compacto ? (pendiente ? `${sinConfirmar}!` : `${fotos.length}✓`) : texto}
    </span>
  );
}

function accionStyle(color, solido) {
  return {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    border: solido ? "none" : `1px solid ${color}40`,
    background: solido ? color : "transparent",
    color: solido ? "#fff" : color,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };
}
