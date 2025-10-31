import React from 'react';

export default function SettingsMenu({ children }) {
  return (
    <div className="esx-settings-menu" style={styles.wrap}>
      <details style={styles.details} className="esx-settings-menu__details">
        <summary style={styles.summary} className="esx-settings-menu__summary">
          Settings
        </summary>
        <div style={styles.content} className="esx-settings-menu__content">
          {children}
        </div>
      </details>
    </div>
  );
}

const styles = {
  wrap: {
    position: 'fixed',
    top: 16,
    right: 16,
    zIndex: 1200,
  },
  details: {
    padding: 0,
    margin: 0,
  },
  summary: {
    cursor: 'pointer',
    userSelect: 'none',
    fontWeight: 600,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft, #d1d5db)',
    background: 'var(--admin-panel-bg, rgba(255,255,255,0.9))',
    color: 'var(--appearance-font-color, var(--admin-body-color, #0f172a))',
    outline: 'none',
  },
  content: {
    marginTop: 12,
    minWidth: 320,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 0,
  },
};
