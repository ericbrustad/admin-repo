import React from 'react';

export default function BackpackButton({ onClick }) {
  return (
    <button aria-label="Backpack" onClick={onClick} style={btn}>
      🎒<span style={{ marginLeft:6 }}>Backpack</span>
    </button>
  );
}

const btn = {
  position:'fixed', left:10, bottom:10, zIndex:1000,
  padding:'10px 12px', borderRadius:10, border:'1px solid #2a323b',
  background:'#1a2027', color:'#e9eef2', cursor:'pointer'
};
