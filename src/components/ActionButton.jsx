import React from "react";
import { C } from "../constants";

/**
 * Button with built-in loading state.
 * Shows ⏳ spinner and disables interaction while loading.
 */
export default function ActionButton({
  onClick,
  loading = false,
  disabled = false,
  children,
  color,
  style = {},
}) {
  const isDisabled = loading || disabled;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        padding: "9px 18px",
        borderRadius: 10,
        border: "none",
        background: isDisabled ? C.border : (color || C.accent),
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.7 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "background 0.15s, opacity 0.15s",
        ...style,
      }}
    >
      {loading && (
        <span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>
          ⏳
        </span>
      )}
      {children}
    </button>
  );
}
