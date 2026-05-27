import React from "react";
import { C } from "../constants";

export default function StatCard({ label, value, color, icon, pct, onClick, warning }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: onClick ? "pointer" : "default",
        background: warning ? `${C.danger}0a` : C.surface,
        borderRadius: 14,
        border: `1px solid ${warning ? C.danger : hovered ? C.accent : C.border}`,
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        transform: hovered && onClick ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered && onClick ? "0 10px 15px -3px rgba(0, 0, 0, 0.05)" : "none",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        flex: 1,
        minWidth: 160,
      }}
    >
      <div style={{ position: "absolute", top: -15, right: -5, fontSize: 44, opacity: 0.06 }}>
        {icon}
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: warning ? C.danger : color || C.text, display: "flex", alignItems: "baseline", gap: 6 }}>
        {value.toLocaleString()}
        {pct !== undefined && (
          <span style={{ fontSize: 13, color: C.textDim, fontWeight: 500 }}>
            ({pct}%)
          </span>
        )}
      </div>
    </div>
  );
}
