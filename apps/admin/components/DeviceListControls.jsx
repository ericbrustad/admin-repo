import React from "react";
export default function DeviceListControls({ devices = [], setDevices, onEdit, onDuplicate, onDelete }) {
  function moveUp(idx){ if(idx<=0) return; const next=[...devices]; const tmp=next[idx-1]; next[idx-1]=next[idx]; next[idx]=tmp; if(typeof setDevices==='function') setDevices(next); }
  function moveDown(idx){ if(idx>=devices.length-1) return; const next=[...devices]; const tmp=next[idx+1]; next[idx+1]=next[idx]; next[idx]=tmp; if(typeof setDevices==='function') setDevices(next); }
  function duplicate(idx){ if(idx<0||idx>=devices.length) return; const item=devices[idx]; const copy={ ...item, title:(item.title||item.name||'Device')+' (copy)' }; const next=[...devices.slice(0,idx+1), copy, ...devices.slice(idx+1)]; if(typeof setDevices==='function') setDevices(next); if(typeof onDuplicate==='function') onDuplicate(idx); }
  function remove(idx){ if(idx<0||idx>=devices.length) return; const next=[...devices.slice(0,idx), ...devices.slice(idx+1)]; if(typeof setDevices==='function') setDevices(next); if(typeof onDelete==='function') onDelete(idx); }
  const itemStyle={ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px', borderRadius:8, border:'1px solid #2a323b', marginBottom:8, background:'#0b1115' };
  const leftStyle={ display:'flex', gap:10, alignItems:'center' };
  const iconStyle={ width:36, height:36, borderRadius:6, objectFit:'cover', background:'#0c0f12', border:'1px solid #222' };
  const btn={ padding:'6px 8px', borderRadius:8, border:'1px solid #2a323b', background:'#0b1115', color:'#e9eef2', cursor:'pointer' };
  const small={ ...btn, padding:'4px 6px', fontSize:12 };
  return (
    <div style={{ width:'100%' }}>
      {devices.length===0 ? (<div style={{ color:'#9fb0bf', padding:8 }}>No devices yet</div>) : devices.map((d,i)=>(
        <div key={d.id||d._id||i} style={itemStyle}>
          <div style={leftStyle}>
            {d.iconUrl ? (<img src={d.iconUrl} alt='' style={iconStyle} />) : (<div style={{...iconStyle, display:'flex', alignItems:'center', justifyContent:'center', color:'#9fb0bf'}}>{d.type ? (d.type[0]||'D').toUpperCase() : 'D'}</div>)}
            <div>
              <div style={{ color:'#e9eef2', fontWeight:600 }}>{d.title||d.name||d.label||`Device ${i+1}`}</div>
              <div style={{ color:'#9fb0bf', fontSize:12 }}>{d.type || (d.deviceType||'')}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button style={small} onClick={()=>moveUp(i)} title='Move up'>▲</button>
            <button style={small} onClick={()=>moveDown(i)} title='Move down'>▼</button>
            <button style={btn} onClick={()=>onEdit && onEdit(d,i)}>Edit</button>
            <button style={small} onClick={()=>duplicate(i)}>Duplicate</button>
            <button style={{...small, background:'#3a1b1b'}} onClick={()=>{ if(confirm('Delete device?')) remove(i); }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
