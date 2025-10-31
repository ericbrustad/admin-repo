import React, { useEffect, useRef } from 'react';

export default function OutcomeModal({ open, outcome, onClose }) {
  const audioRef = useRef(null);
  const o = outcome || {};
  useEffect(() => {
    if (open && o.audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(()=>{});
    }
  }, [open, o.audioUrl]);

  if (!open) return null;
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/i.test(o.mediaUrl || '');
  const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/i.test(o.mediaUrl || '');

  return (
    <div style={wrap} onClick={onClose}>
      <div style={panel} onClick={(e)=>e.stopPropagation()}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>{o.title || 'Result'}</div>
          <button onClick={onClose} style={btn}>Close</button>
        </div>
        {o.message && <div style={{ marginBottom:8 }}>{o.message}</div>}

        {o.mediaUrl && (
          isVideo ? <video src={o.mediaUrl} controls style={{ width:'100%', borderRadius:10 }}/>
                  : isImage ? <img src={o.mediaUrl} alt="outcome" style={{ width:'100%', borderRadius:10 }}/>
                           : <a href={o.mediaUrl} target="_blank" rel="noreferrer" style={{ color:'#9fb0bf' }}>Open media</a>
        )}

        {o.audioUrl && <audio ref={audioRef} src={o.audioUrl} />}
      </div>
    </div>
  );
}

const wrap  = { position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'grid', placeItems:'center', zIndex:9999, padding:16 };
const panel = { background:'#11161a', border:'1px solid #1f2329', borderRadius:12, padding:12, width:'min(560px, 96vw)' };
const btn   = { padding:'10px 14px', borderRadius:10, border:'1px solid #2a323b', background:'#1a2027', color:'#e9eef2', cursor:'pointer' };
