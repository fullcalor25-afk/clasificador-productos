import React from "react";
import { C } from "../constants";

export default function Topbar({
  view,
  setView,
  hasActiveSession,
  onSave,
  onExport,
  onReset,
  aiState,
  historyDetailName,
  selectedCount = 0,
}) {
  const [exportOpen, setExportOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);

  // Click outside to close dropdown
  React.useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setExportOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Breadcrumb mapper
  const getBreadcrumbs = () => {
    switch (view) {
      case "home":
        return ["Inicio"];
      case "upload":
        return ["Principal", "Nuevo análisis"];
      case "dashboard":
        return ["Análisis activo", "Dashboard"];
      case "table":
        return ["Análisis activo", "Tabla de productos"];
      case "exportTN":
        return ["Análisis activo", "Tienda Nube"];
      case "history":
        return ["Datos", "Historial"];
      case "historyDetail":
        return ["Datos", "Historial", historyDetailName || "Detalle"];
      case "learning":
        return ["Datos", "Aprendizaje"];
      case "categories":
        return ["Datos", "Categorías"];
      case "classificationRules":
        return ["Configuración", "Reglas de clasificación"];
      case "settings":
        return ["Configuración", "Ajustes"];
      default:
        return ["HVAC Pro"];
    }
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div
      style={{
        height: 52,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500 }}>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span
              style={{
                color: idx === breadcrumbs.length - 1 ? C.text : C.textDim,
                fontWeight: idx === breadcrumbs.length - 1 ? 600 : 500,
              }}
            >
              {crumb}
            </span>
            {idx < breadcrumbs.length - 1 && <span style={{ color: C.textDim }}>/</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Contextual Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Selection badge (visible when products are selected in table) */}
        {view === "table" && selectedCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: `${C.danger}15`, border: `1px solid ${C.danger}30`, color: C.danger,
          }}>
            ☑ {selectedCount} seleccionado{selectedCount !== 1 ? "s" : ""}
          </div>
        )}
        {/* Dynamic actions for table/dashboard */}
        {hasActiveSession && ["dashboard", "table", "exportTN"].includes(view) && (
          <>
            {onSave && (
              <button
                onClick={onSave}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${C.accent}`,
                  background: C.accentBg,
                  color: C.accent,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  transition: "all 0.2s",
                }}
              >
                💾 Guardar
              </button>
            )}

            {onExport && (
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setExportOpen(!exportOpen)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: `1px solid ${C.success}`,
                    background: `${C.success}12`,
                    color: C.success,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  📥 Exportar CSV ▾
                </button>
                {exportOpen && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "110%",
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
                      display: "flex",
                      flexDirection: "column",
                      width: 170,
                      zIndex: 10,
                      padding: 4,
                    }}
                  >
                    {/* Tienda Nube */}
                    <button
                      onClick={() => { onExport("TN"); setExportOpen(false); }}
                      style={{ padding: "6px 10px", borderRadius: 6, background: "transparent", border: "none", color: C.success, fontSize: 12, textAlign: "left", cursor: "pointer", fontWeight: 700 }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      🛒 Para Tienda Nube
                    </button>
                    <div style={{ height: 1, background: C.border, margin: "2px 0" }} />
                    {/* Análisis interno */}
                    <div style={{ padding: "3px 10px 1px", fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      📊 Análisis interno
                    </div>
                    {[
                      { id: "ALL", label: "Exportar Todos" },
                      { id: "REPUESTO", label: "Solo Repuestos" },
                      { id: "ACCESORIO", label: "Solo Accesorios" },
                      { id: "PRODUCTO_COMPLETO", label: "Solo Prod. Completos" },
                      { id: "SERVICIO", label: "Solo Servicios" },
                      { id: "OTRO", label: "Solo Otros" },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { onExport(opt.id); setExportOpen(false); }}
                        style={{ padding: "6px 10px", borderRadius: 6, background: "transparent", border: "none", color: C.text, fontSize: 12, textAlign: "left", cursor: "pointer", fontWeight: 500 }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {onReset && (
              <button
                onClick={onReset}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: `1px solid ${C.danger}30`,
                  background: "transparent",
                  color: C.danger,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${C.danger}12`}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                Nueva carga
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
