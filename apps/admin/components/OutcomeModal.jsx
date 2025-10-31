// components/OutcomeModal.jsx
import React, { useEffect, useState } from 'react';

export default function OutcomeModal({ open, onClose = () => {}, title = 'Outcome', outcome = {}, onSave = () => {} }) {
  const [local, setLocal] = useState({
    mode: 'none', // 'none' | 'message' | 'media' | 'mission' | 'device'
    message: '',
    mediaUrl: '',
    targetId: '',
    ...outcome,
  });

  useEffect(() => {
    if (open) {
      setLocal(prev => ({ ...prev, ...outcome }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outcome]);

  if (!open) return null;

  function update(key, value) {
    setLocal(l => ({ ...l, [key]: value }));
  }

  function handleSave() {
    onSave(local);
    onClose();
  }

  function renderPreview() {
    const u = (local.mediaUrl || '').trim();
    if (!u) return null;
    const lower = u.toLowerCase();
    if (/\.(mp4|webm|mov)(\?|#|$)/.test(lower)) {
      return <video src={u} controls style={styles.previewMedia} />;
    }
    if (/\.(png|jpg|jpeg|gif|webp)(\?|#|$)/.test(lower) || u.includes('drive.google.com/uc?export=view')) {
      return <img src={u} alt="preview" style={styles.previewMedia} />;
    }
    if (/\.(mp3|wav|ogg|m4a|aiff|aif)(\?|#|$)/.test(lower)) {
      return <audio src={u} controls style={{ width: '100%' }} />;
    }
    return <a href={u} target="_blank" rel="noreferrer" style={{ color: '#9fb0bf' }}>Open media URL</a>;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div>
            <button style={styles.smallButton} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={styles.body}>
          <label style={styles.label}>Action (mode)</label>
          <select
            value={local.mode || 'none'}
            onChange={(e) => update('mode', e.target.value)}
            style={styles.input}
          >
            <option value="none">None (no response)</option>
            <option value="message">Show Message</option>
            <option value="media">Play Media (image/video/audio)</option>
            <option value="mission">Open Mission</option>
            <option value="device">Trigger Device</option>
          </select>

          {local.mode === 'message' && (
            <>
              <label style={styles.label}>Message (text)</label>
              <textarea
                style={{ ...styles.input, height: 96 }}
                value={local.message || ''}
                onChange={(e) => update('message', e.target.value)}
              />
            </>
          )}

          {local.mode === 'media' && (
            <>
              <label style={styles.label}>Media URL</label>
              <input
                style={styles.input}
                value={local.mediaUrl || ''}
                placeholder="https://..."
                onChange={(e) => update('mediaUrl', e.target.value)}
              />
              <div style={{ marginTop: 8 }}>{renderPreview()}</div>
            </>
          )}

          {(local.mode === 'mission' || local.mode === 'device') && (
            <>
              <label style={styles.label}>{local.mode === 'mission' ? 'Mission ID' : 'Device ID / key'}</label>
              <input
                style={styles.input}
                value={local.targetId || ''}
                placeholder={local.mode === 'mission' ? 'm01' : 'd01 or device-key'}
                onChange={(e) => update('targetId', e.target.value)}
              />
              <div style={{ fontSize: 12, color: '#9fb0bf', marginTop: 6 }}>
                When this outcome triggers, the selected {local.mode === 'mission' ? 'mission' : 'device'} will be activated (if supported).
              </div>
            </>
          )}
        </div>

        <div style={styles.footer}>
          <button style={{ ...styles.button, background: '#263238' }} onClick={onClose}>Cancel</button>
          <button style={styles.button} onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* Inline styles */
const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 3000,
    padding: 16,
  },
  modal: {
    width: 'min(720px, 96vw)',
    background: '#12181d',
    border: '1px solid #1f262d',
    borderRadius: 12,
    padding: 14,
    color: '#e9eef2',
    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  body: {
    display: 'grid',
    gap: 10,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2a323b',
    background: '#0b0c10',
    color: '#e9eef2',
    boxSizing: 'border-box',
  },
  label: {
    fontSize: 12,
    color: '#9fb0bf',
  },
  button: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #2a323b',
    background: '#1a2027',
    color: '#e9eef2',
    cursor: 'pointer',
  },
  smallButton: {
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid #2a323b',
    background: '#0f1418',
    color: '#e9eef2',
    cursor: 'pointer',
  },
  previewMedia: {
    width: '100%',
    maxHeight: 260,
    objectFit: 'contain',
    borderRadius: 10,
    border: '1px solid #2a323b',
  },
};
