import React from "react";

/**
 * OutcomeModal.jsx - small wrapper modal used by AnswerResponseEditor
 * If your project already has an OutcomeModal component, replace this file.
 */

export default function OutcomeModal({ open = true, onClose = () => {}, children }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: "fixed", left: 0, top: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.65)", zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }} onClick={(e)=>{ if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ maxWidth: "100%", width: "920px" }}>
        {children}
      </div>
    </div>
  );
}
