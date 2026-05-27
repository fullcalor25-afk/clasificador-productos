import React from "react";
import { C } from "../constants";

export default function BarChart({ items, max, color = C.accent, title }) {
  if (!items || items.length === 0) {
    return <div style={{ color: C.textDim, fontSize: 13, padding: "10px 0" }}>Sin datos para mostrar</div>;
  }

  const baseMax = max || Math.max(...items.map(item => item.value), 1);

  return (
    <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 20, width: "100%" }}>
      {title && <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>{title}</h4>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((item, idx) => {
          const percentage = Math.round((item.value / baseMax) * 100);
          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500 }}>
                <span style={{ color: C.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "75%" }}>
                  {item.label}
                </span>
                <span style={{ fontWeight: 600, color: item.color || color }}>
                  {item.value.toLocaleString()}
                </span>
              </div>
              <div style={{ height: 6, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${percentage}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${item.color || color}, ${C.accent})`,
                    borderRadius: 3,
                    transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
