import React from 'react';
import { getBackpack, removePocketItem } from '../lib/backpack';

export default function BackpackDrawer({ slug, open, onClose }) {
  if (!open) return null;
  const s = getBackpack(slug);
  const ph = (s.pockets?.photos)||[];
  const rw = (s.pockets?.rewards)||[];
  const ut = (s.pockets?.utilities)||[];
  const cl = (s.pockets?.clues)||[];

  return (
    <div style={wrap} onClick={onClose}>
      <div style={panel} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Backpack</div>
          <button onClick={onClose} style={btn}>Close</button>
        </div>

        <Section title="Photos">
          <ThumbGrid
            items={ph.map(x=>({ id:x.id, title:x.title, url:x.url }))}
            onRemove={(id)=>{ removePocketItem(slug, 'photos', id); onClose(); }}
          />
        </Section>

        <Section title="Rewards">
          <ThumbGrid
            items={rw.map(x=>({ id:x.id, title:x.name, url:x.thumbUrl }))}
            onRemove={(id)=>{ removePocketItem(slug, 'rewards', id); onClose(); }}
          />
        </Section>

        <Section title="Utilities">
          <ThumbGrid
            items={ut.map(x=>({ id:x.id, title:x.name, url:x.thumbUrl }))}
            onRemove={(id)=>{ removePocketItem(slug, 'utilities', id); onClose(); }}
          />
        </Section>

        <Section title="Clues">
          <ul style={{ margin:0, paddingLeft:18 }}>
            {cl.map(c=><li key={c.id} style={{ margin:'6px 0' }}>{c.text}</li>)}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontWeight:600, margin:'6px 0' }}>{title}</div>
      {children}
    </div>
  );
}

function ThumbGrid({ items, onRemove }) {
  if (!items.length) return <div style={{ color:'#9fb0bf' }}>Empty.</div>;
  return (
    <div style={{ display:'grid', gap:12, gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))' }}>
      {items.map(it=>(
        <div key={it.id} style={{ border:'1px solid #2a323b', borderRadius:10, background:'#0f1418', padding:8 }}>
          <div style={{ width:'100%', height:90, border:'1px solid #1f262d', borderRadius:8, overflow:'hidden', display:'grid', placeItems:'center' }}>
            {it.url ? <img alt="" src={it.url} style={{ maxWidth:'100%', maxHeight:'100%' }}/> : <div style={{ color:'#9fb0bf' }}>—</div>}
          </div>
          <div style={{ fontSize:12, marginTop:6, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.title || 'Item'}</div>
          <button style={{ ...btn, width:'100%', marginTop:6 }} onClick={()=>onRemove && onRemove(it.id)}>Remove</button>
        </div>
      ))}
    </div>
  );
}

const wrap  = { position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'grid', placeItems:'center', zIndex:9999, padding:16 };
const panel = { width:'min(900px, 96vw)', maxHeight:'85vh', overflowY:'auto', background:'#11161a', border:'1px solid #1f2329', borderRadius:12, padding:12 };
const btn   = { padding:'8px 10px', borderRadius:8, border:'1px solid #2a323b', background:'#1a2027', color:'#e9eef2', cursor:'pointer' };
