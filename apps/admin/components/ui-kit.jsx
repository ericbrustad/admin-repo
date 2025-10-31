// components/ui-kit.jsx
import React, { useEffect, useState } from 'react';
import {
  clamp, hexToRgb, toDirectMediaURL,
  FONT_FAMILIES, defaultAppearance
} from '../lib/admin-shared';

/* -------- Field wrappers -------- */
export function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#9fb0bf', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
export function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div style={{ display:'grid', gridTemplateColumns:'100px 1fr', gap:8, alignItems:'center' }}>
        <input type="color" value={value || '#000000'} onChange={(e)=>onChange(e.target.value)} />
        <input style={styles.input} value={value || ''} onChange={(e)=>onChange(e.target.value)} />
      </div>
    </Field>
  );
}

/* -------- Appearance Editor -------- */
export function AppearanceEditor({ value, onChange }) {
  const a = value || defaultAppearance();
  return (
    <div style={{ border:'1px solid #22303c', borderRadius:10, padding:12 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        <Field label="Font family">
          <select style={styles.input} value={a.fontFamily} onChange={(e)=>onChange({ ...a, fontFamily:e.target.value })}>
            {FONT_FAMILIES.map(f=><option key={f.v} value={f.v}>{f.label}</option>)}
          </select>
          <div style={{ marginTop:6, padding:'6px 10px', border:'1px dashed #2a323b', borderRadius:8, fontFamily:a.fontFamily }}>
            Aa — preview text with this font
          </div>
        </Field>
        <Field label="Font size (px)">
          <input type="number" min={10} max={72} style={styles.input}
            value={a.fontSizePx} onChange={(e)=>onChange({ ...a, fontSizePx:clamp(Number(e.target.value||0),10,72) })}/>
        </Field>
        <ColorField label="Text color" value={a.fontColor} onChange={(v)=>onChange({ ...a, fontColor:v })}/>
        <ColorField label="Text background color" value={a.textBgColor} onChange={(v)=>onChange({ ...a, textBgColor:v })}/>
        <Field label="Text background opacity">
          <input type="range" min={0} max={1} step={0.05} value={a.textBgOpacity}
            onChange={(e)=>onChange({ ...a, textBgOpacity:Number(e.target.value) })}/>
          <div style={{ color:'#9fb0bf', fontSize:12, marginTop:4 }}>{(a.textBgOpacity*100).toFixed(0)}%</div>
        </Field>
        <Field label="Text shadow (CSS)">
          <input
            style={styles.input}
            value={a.textShadow || ''}
            onChange={(e)=>onChange({ ...a, textShadow:e.target.value })}
            placeholder="0 2px 8px rgba(0,0,0,0.45)"
          />
        </Field>
        <ColorField label="Screen background color" value={a.screenBgColor} onChange={(v)=>onChange({ ...a, screenBgColor:v })}/>
        <Field label="Screen background opacity">
          <input type="range" min={0} max={1} step={0.05} value={a.screenBgOpacity}
            onChange={(e)=>onChange({ ...a, screenBgOpacity:Number(e.target.value) })}/>
          <div style={{ color:'#9fb0bf', fontSize:12, marginTop:4 }}>{(a.screenBgOpacity*100).toFixed(0)}%</div>
        </Field>
        <Field label="Screen background image (URL)">
          <input style={styles.input} value={a.screenBgImage || ''} onChange={(e)=>onChange({ ...a, screenBgImage:e.target.value })}/>
          {a.screenBgImage && (
            <img src={toDirectMediaURL(a.screenBgImage)} alt="bg"
                 style={{ marginTop:6, width:'100%', maxHeight:120, objectFit:'cover', border:'1px solid #2a323b', borderRadius:8 }}/>
          )}
        </Field>
        <Field label="Text alignment (horizontal)">
          <select style={styles.input} value={a.textAlign} onChange={(e)=>onChange({ ...a, textAlign:e.target.value })}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </Field>
        <Field label="Text position (vertical)">
          <select style={styles.input} value={a.textVertical} onChange={(e)=>onChange({ ...a, textVertical:e.target.value })}>
            <option value="top">Top</option><option value="center">Center</option>
          </select>
        </Field>
      </div>

      <div style={{
        marginTop:12, border:'1px dashed #2a323b', borderRadius:10, overflow:'hidden',
        background:a.screenBgImage
          ? `linear-gradient(rgba(0,0,0,${a.screenBgOpacity}), rgba(0,0,0,${a.screenBgOpacity})), url(${toDirectMediaURL(a.screenBgImage)}) center/cover no-repeat`
          : `linear-gradient(rgba(0,0,0,${a.screenBgOpacity}), rgba(0,0,0,${a.screenBgOpacity})), ${a.screenBgColor}`,
        padding:12, height:120, display:'grid', placeItems: a.textVertical==='center' ? 'center' : 'start',
      }}>
        <div style={{
          maxWidth:'100%',
          background:`rgba(${hexToRgb(a.textBgColor)}, ${a.textBgOpacity})`,
          padding:'6px 10px', borderRadius:8, color:a.fontColor, fontFamily:a.fontFamily, fontSize:a.fontSizePx,
          textAlign:a.textAlign, width:'fit-content',
          textShadow:a.textShadow || 'none',
          justifySelf: a.textAlign==='left' ? 'start' : a.textAlign==='right' ? 'end' : 'center',
        }}>
          Preview text
        </div>
      </div>
    </div>
  );
}

/* -------- MCQ Editor -------- */
export function MultipleChoiceEditor({ value, correctIndex, onChange }) {
  const [local, setLocal] = useState(Array.isArray(value) ? value.slice(0, 5) : []);
  const [correct, setCorrect] = useState(Number.isInteger(correctIndex) ? correctIndex : undefined);

  useEffect(()=>{ setLocal(Array.isArray(value)?value.slice(0,5):[]); },[value]);
  useEffect(()=>{ setCorrect(Number.isInteger(correctIndex)?correctIndex:undefined); },[correctIndex]);

  function sync(nextChoices, nextCorrect) {
    const trimmed = nextChoices.map(s=>(s || '').trim()).filter(Boolean).slice(0,5);
    const ci = Number.isInteger(nextCorrect) && nextCorrect < trimmed.length ? nextCorrect : undefined;
    onChange({ choices: trimmed, correctIndex: ci });
  }

  return (
    <div style={{ border:'1px solid #2a323b', borderRadius:10, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:8 }}>Choices (A–E)</div>
      {[0,1,2,3,4].map(i=>(
        <div key={i} style={{ display:'grid', gridTemplateColumns:'24px 1fr', alignItems:'center', gap:8, marginBottom:8 }}>
          <input type="radio" name="mcq-correct" checked={correct===i} onChange={()=>{ setCorrect(i); sync(local,i); }} title="Mark as correct"/>
          <input placeholder={`Choice ${String.fromCharCode(65+i)}`} style={styles.input} value={local[i]||''}
            onChange={(e)=>{ const next=[...local]; next[i]=e.target.value; setLocal(next); sync(next, correct); }}/>
        </div>
      ))}
      <div style={{ color:'#9fb0bf', fontSize:12 }}>Leave blanks for unused options. Exactly one radio can be marked correct.</div>
    </div>
  );
}

/* -------- Media Preview -------- */
export function MediaPreview({ url, kind }) {
  if (!url) return null;
  const u = toDirectMediaURL(String(url).trim());
  const lower = u.toLowerCase();
  const isVideo = /\.(mp4|webm|mov)(\?|#|$)/.test(lower);
  const isImage = /\.(png|jpg|jpeg|gif|webp)(\?|#|$)/.test(lower) || u.includes('drive.google.com/uc?export=view');

  return (
    <div style={{ marginTop:8 }}>
      <div style={{ color:'#9fb0bf', fontSize:12, marginBottom:6 }}>Preview ({kind})</div>
      {isVideo ? (
        <video src={u} controls style={{ width:'100%', maxHeight:260, borderRadius:10, border:'1px solid #2a323b' }}/>
      ) : isImage ? (
        <img src={u} alt="preview" style={{ width:'100%', maxHeight:260, objectFit:'contain', borderRadius:10, border:'1px solid #2a323b' }}/>
      ) : (
        <a href={u} target="_blank" rel="noreferrer" style={{ color:'#9fb0bf', textDecoration:'underline' }}>Open media</a>
      )}
    </div>
  );
}

/* -------- shared styles for inputs -------- */
export const styles = {
  input:{ width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #2a323b', background:'#0b0c10', color:'#e9eef2' }
};
