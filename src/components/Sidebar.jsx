import React from "react";
import { C } from "../constants";

export default function Sidebar({ view, setView, hasActiveSession, historyCount = 0, correctionsCount = 0 }) {
  const [hoveredItem, setHoveredItem] = React.useState(null);

  const sections = [
    {
      title: "PRINCIPAL",
      items: [
        { id: "home", label: "Inicio", icon: "🏠" },
        { id: "upload", label: "Nuevo análisis", icon: "📤" },
      ]
    },
    {
      title: "ANÁLISIS ACTIVO",
      visible: hasActiveSession,
      items: [
        { id: "dashboard", label: "Dashboard", icon: "📊" },
        { id: "table", label: "Tabla de productos", icon: "📋" },
        { id: "exportTN", label: "Exportar Tienda Nube", icon: "🛒" },
      ]
    },
    {
      title: "DATOS",
      items: [
        { id: "history", label: "Historial", icon: "🗂", badge: historyCount },
        { id: "learning", label: "Aprendizaje", icon: "🧠", badge: correctionsCount },
        { id: "categories", label: "Categorías", icon: "📁" },
      ]
    },
    {
      title: "CONFIGURACIÓN",
      items: [
        { id: "classificationRules", label: "Clasificación", icon: "⚙️" },
        { id: "settings", label: "Ajustes", icon: "🔧" },
      ]
    }
  ];

  return (
    <div
      style={{
        width: 220,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "sticky",
        top: 0,
        zIndex: 101,
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent), var(--warning))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            color: "#fff",
            boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.2)",
          }}
        >
          ⚡
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: "-0.01em" }}>
            HVAC Pro
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 500 }}>
            Clasificador inteligente
          </div>
        </div>
      </div>

      {/* Nav Items */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {sections
          .filter(sec => sec.visible !== false)
          .map((sec, secIdx) => (
            <div key={secIdx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textDim,
                  padding: "0 12px 6px 12px",
                  letterSpacing: "0.08em",
                }}
              >
                {sec.title}
              </div>
              {sec.items.map(item => {
                const isActive = view === item.id || (item.id === "history" && view === "historyDetail");
                const isHovered = hoveredItem === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setView(item.id);
                      localStorage.setItem("hvac_last_view", item.id);
                    }}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: isActive ? C.accentBg : isHovered ? C.surface2 : "transparent",
                      color: isActive ? C.accent : C.textMuted,
                      fontWeight: isActive ? 600 : 500,
                      fontSize: 13,
                      borderLeft: `3px solid ${isActive ? C.accent : "transparent"}`,
                      paddingLeft: isActive ? 9 : 12,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 15, filter: isActive ? "none" : "grayscale(30%)" }}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: isActive ? `${C.accent}20` : C.surface2,
                          color: isActive ? C.accent : C.textMuted,
                          fontWeight: 700,
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 24px",
          borderTop: `1px solid ${C.border}`,
          fontSize: 11,
          color: C.textDim,
          fontWeight: 500,
          background: C.surface2,
        }}
      >
        v2.1 · netlify.app
      </div>
    </div>
  );
}
