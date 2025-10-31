import React, { useState } from 'react';
import InlineMissionResponses from './InlineMissionResponses';

/**
 * DevicesList component
 * - devices: array of { id, name, lat, lng, thumbnailUrl, triggeredTicker, triggerTargetId, enableOnCorrect, enableOnWrong, hasResponses }
 * - triggerDevices: array of devices for dropdown
 * - onReorder(id, dir)
 * - onUpdate(device)
 */
export default function DevicesList({ devices = [], triggerDevices = [], onReorder = () => {}, onUpdate = () => {} }) {
  const [editingId, setEditingId] = useState(null);
  const [local, setLocal] = useState({});

  function startEdit(device) {
    setEditingId(device.id);
    setLocal({ ...device });
  }

  function saveEdit() {
    onUpdate(local);
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {devices.map((d, i) => {
          const selected = editingId === d.id;
          return (
            <div
              key={d.id}
              onClick={() => startEdit(d)}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: 10,
                borderRadius: 8,
                cursor: 'pointer',
                background: selected ? 'rgba(130,200,140,0.12)' : 'transparent',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {/* Thumbnail */}
              <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: '#0b0f11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {d.thumbnailUrl ? <img src={d.thumbnailUrl} alt={d.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ color: '#6e848b', fontSize: 11, textAlign: 'center' }}>No<br/>Thumb</div>}
              </div>

              {/* Label & coords */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{d.id} — {d.name}</div>
                  <div style={{ fontSize: 12, color: '#9fb0bf' }}>{typeof d.lat === 'number' ? d.lat.toFixed(4) : d.lat}, {typeof d.lng === 'number' ? d.lng.toFixed(4) : d.lng}</div>
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.hasResponses ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: '#2bc36b' }} />
                      <div style={{ fontSize: 11, color: '#cfe8ea' }}>Has Response</div>
                    </div>
                  ) : null}
                  {d.triggeredTicker ? <div style={{ marginLeft: 8, fontSize: 11, color: '#cfe8ea' }}>Ticker: {d.triggeredTicker}</div> : null}
                </div>
              </div>

              {/* Up / down arrows (stop click propagation) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => onReorder(d.id, 'up')} style={{ padding: 6, borderRadius: 6 }}>▲</button>
                <button type="button" onClick={() => onReorder(d.id, 'down')} style={{ padding: 6, borderRadius: 6 }}>▼</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline editor for the selected device */}
      {editingId ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: '#071213', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Edit Device — {local.id}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#9fb0bf' }}>Name</label>
              <input value={local.name || ''} onChange={(e) => setLocal({...local, name: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }} />

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: '#9fb0bf' }}>Latitude</label>
                  <input value={local.lat || ''} onChange={(e) => setLocal({...local, lat: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }} />
                </div>
                <div style={{ width: 160 }}>
                  <label style={{ fontSize: 12, color: '#9fb0bf' }}>Longitude</label>
                  <input value={local.lng || ''} onChange={(e) => setLocal({...local, lng: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }} />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: '#9fb0bf' }}>Triggered Device (ticker)</label>
                <input value={local.triggeredTicker || ''} onChange={(e) => setLocal({...local, triggeredTicker: e.target.value})} placeholder="e.g., D2" style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }} />
                <div style={{ fontSize: 12, color: '#6e848b', marginTop: 6 }}>Short ticker to display when this device triggers.</div>
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: '#9fb0bf' }}>Response Triggers / GeoTrigger Devices</label>
                {Array.isArray(triggerDevices) && triggerDevices.length > 0 ? (
                  <select value={local.triggerTargetId || ''} onChange={(e) => setLocal({...local, triggerTargetId: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }}>
                    <option value=''>-- select --</option>
                    {triggerDevices.map(td => (<option key={td.id} value={td.id}>{td.name}</option>))}
                  </select>
                ) : (
                  <div style={{ marginTop: 6, color: '#cfe8ea' }}>None available</div>
                )}
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!local.enableOnCorrect} onChange={(e) => setLocal({...local, enableOnCorrect: e.target.checked})} />
                  <span style={{ color: '#cfe8ea' }}>Enable On Correct Response</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={!!local.enableOnWrong} onChange={(e) => setLocal({...local, enableOnWrong: e.target.checked})} />
                  <span style={{ color: '#cfe8ea' }}>Enable On Wrong Response</span>
                </label>
              </div>

            </div>

            <div>
              <div style={{ fontSize: 12, color: '#9fb0bf', marginBottom: 6 }}>Thumbnail</div>
              <div style={{ width: '100%', height: 140, borderRadius: 8, overflow: 'hidden', background: '#0b0f11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {local.thumbnailUrl ? <img src={local.thumbnailUrl} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ color: '#6e848b' }}>No thumbnail</div>}
              </div>

              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: '#9fb0bf' }}>Thumbnail URL</label>
                <input value={local.thumbnailUrl || ''} onChange={(e) => setLocal({...local, thumbnailUrl: e.target.value})} style={{ width: '100%', padding: 8, borderRadius: 6, marginTop: 6 }} placeholder="https://..." />
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button onClick={saveEdit} style={{ padding: 8, borderRadius: 6 }}>Save</button>
                <button onClick={cancelEdit} style={{ padding: 8, borderRadius: 6, background: '#122027', color: '#cfe8ea' }}>Cancel</button>
              </div>
            </div>
          </div>

          {/* inline responses editor component - shows media type selector and trigger toggles */}
          <div style={{ marginTop: 12 }}>
            <InlineMissionResponses
              value={{ onCorrect: { enabled: !!local.enableOnCorrect, isTrigger: false }, onWrong: { enabled: !!local.enableOnWrong, isTrigger: false } }}
              mediaPool={[]}
              onChange={(v) => { /* keep integrated with saveEdit if you want */ console.log('responses changed', v); }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
