import React, { useEffect, useRef, useState } from 'react';

export default function PhotoCapture({ overlayUrl, onCancel, onSave }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [usingFile, setUsingFile] = useState(false);
  const [streamErr, setStreamErr] = useState('');

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setStreamErr('Camera not available. Use file upload.');
        setUsingFile(true);
      }
    })();
    return () => { try { stream && stream.getTracks().forEach(t => t.stop()); } catch {} };
  }, []);

  async function composite(imgBitmap) {
    const v = videoRef.current;
    const c = canvasRef.current;
    const ctx = c.getContext('2d');

    if (imgBitmap) {
      // user selected a file -> draw that into canvas first
      c.width = imgBitmap.width; c.height = imgBitmap.height;
      ctx.drawImage(imgBitmap, 0, 0);
    } else {
      // from live camera
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return;
      c.width = w; c.height = h;
      ctx.drawImage(v, 0, 0, w, h);
    }

    if (overlayUrl) {
      const overlay = await createImageBitmap(await (await fetch(overlayUrl, { cache: 'no-store' })).blob());
      // scale overlay to canvas size
      ctx.drawImage(overlay, 0, 0, c.width, c.height);
    }

    const dataUrl = c.toDataURL('image/png', 0.95);
    onSave && onSave(dataUrl);
  }

  async function handleFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const bmp = await createImageBitmap(f);
    await composite(bmp);
  }

  return (
    <div style={wrap}>
      <div style={panel}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', marginBottom:8 }}>
          <div style={{ fontWeight:700 }}>Camera</div>
          <button onClick={onCancel} style={btn}>Close</button>
        </div>

        {!usingFile && (
          <>
            <video ref={videoRef} playsInline muted style={{ width:'100%', borderRadius:10, background:'#000' }} />
            <div style={{ marginTop:8, display:'flex', gap:8, justifyContent:'space-between' }}>
              <div style={{ color:'#9fb0bf' }}>{streamErr || 'Align your shot and tap Capture.'}</div>
              <button style={btn} onClick={()=>composite(null)}>📸 Capture</button>
            </div>
          </>
        )}

        {(usingFile || streamErr) && (
          <label style={{ ...btn, display:'inline-block', marginTop:8 }}>
            Choose Photo
            <input type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleFile}/>
          </label>
        )}

        <canvas ref={canvasRef} style={{ display:'none' }} />
      </div>
    </div>
  );
}

const wrap  = { position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', display:'grid', placeItems:'center', zIndex:9999, padding:16 };
const panel = { background:'#11161a', border:'1px solid #1f2329', borderRadius:12, padding:12, width:'min(540px, 96vw)' };
const btn   = { padding:'10px 14px', borderRadius:10, border:'1px solid #2a323b', background:'#1a2027', color:'#e9eef2', cursor:'pointer' };
