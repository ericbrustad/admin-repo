import React from 'react';

export default function BackpackButton({ onClick, itemCount }) {
  const showCount = Number.isFinite(Number(itemCount)) && Number(itemCount) > 0;
  return (
    <button aria-label="Backpack" onClick={onClick} style={btn}>
      <span role="img" aria-hidden="true">🎒</span>
      <span style={{ marginLeft: 6 }}>Backpack</span>
      {showCount && (
        <span style={badge} aria-label={`${itemCount} items in backpack`}>
          {itemCount}
        </span>
      )}
    </button>
  );
}

const btn = {
  position: 'fixed',
  left: 10,
  bottom: 10,
  zIndex: 1000,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a323b',
  background: '#1a2027',
  color: '#e9eef2',
  cursor: 'pointer',
  fontWeight: 600,
};

const badge = {
  marginLeft: 8,
  minWidth: 20,
  padding: '2px 6px',
  borderRadius: 999,
  background: '#3dd68c',
  color: '#07161b',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.4,
};
