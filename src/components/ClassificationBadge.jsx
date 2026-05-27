import React from "react";
import { CLS, CLS_COLORS, C } from "../constants";

export default function ClassificationBadge({ classification, source, isManual, confidence }) {
  const cfg = CLS[classification] || CLS.OTRO;
  const isAprendido = source === "APRENDIDO" || isManual;

  // Let's decide exact colors based on classification
  const colors = CLS_COLORS[classification] || CLS_COLORS.OTRO;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        background: isAprendido ? `${C.accent}12` : colors.bg,
        color: isAprendido ? C.accent : colors.text,
        border: `1px solid ${isAprendido ? C.accent : colors.border}30`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        whiteSpace: "nowrap",
      }}
      title={confidence !== undefined ? `Confianza: ${confidence}% | Fuente: ${source || "REGLAS"}` : undefined}
    >
      <span style={{ fontSize: 13 }}>{isAprendido ? "📚" : cfg.icon}</span>
      <span>{cfg.label}</span>
      {isManual && <span style={{ fontSize: 9, opacity: 0.75, background: `${C.accent}20`, padding: "1px 4px", borderRadius: 4, marginLeft: 2 }}>M</span>}
      {!isManual && source === "IA" && <span style={{ fontSize: 9, opacity: 0.75, background: "rgba(0,0,0,0.06)", padding: "1px 4px", borderRadius: 4, marginLeft: 2 }}>🤖</span>}
    </span>
  );
}
