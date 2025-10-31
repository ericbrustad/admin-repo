import React from 'react';

/**
 * Compact single-row header for Admin.
 * - Normal mode: [Icon] [Title] [nav/actions -> horizontal scroll]
 * - Settings mode: [Icon] [Title] [Settings label] [Back button]
 * - Global status statement (Draft/Published) always visible (right side).
 */
export default function HeaderBar({
  iconUrl,
  title = 'Untitled Game',
  isSettings = false,
  status = 'draft', // 'draft' | 'published'
  onBack = () => {},
  onGo = () => {}, // (key) => void ; keys: 'settings','missions','devices','text','assigned','media','new','save','publish','update','save_and_publish'
  onUpdate = null,
  onSaveAndPublish = null,
  onMakeLive = null,
  onSetDraftMode = null,
}) {
  const S = styles;
  const statusIsPublished = String(status).toLowerCase() === 'published';
  const statusLabel = statusIsPublished ? 'This version is Live' : 'This version is a Draft';
  const statusStyle = statusIsPublished ? S.statusPublished : S.statusDraft;
  const statusHint = statusIsPublished
    ? 'Players are currently experiencing this build.'
    : 'This will enable your Game to be published.';

  const handleMakeLive = () => {
    if (typeof onMakeLive === 'function') {
      onMakeLive();
      return;
    }
    if (typeof onSaveAndPublish === 'function') {
      onSaveAndPublish();
      return;
    }
    onGo('make_live');
  };

  const handleSetDraft = () => {
    if (typeof onSetDraftMode === 'function') {
      onSetDraftMode();
      return;
    }
    onGo('set_draft_mode');
  };

  return (
    <header id="AdminHeaderBar" data-ui="headerbar" style={S.wrap}>
      <div style={S.left}>
        <div style={S.iconWrap}>
          {iconUrl ? <img src={iconUrl} alt="" style={S.icon} /> : <div style={S.iconPlaceholder} />}
        </div>
        <div style={S.titleWrap}>
          <div style={S.title}>{title}</div>
          {isSettings ? (
            <div style={S.subtitle}>Settings</div>
          ) : (
            <div style={S.subtitle}>Admin Control Deck</div>
          )}
        </div>
      </div>

      {/* Middle: actions (hidden in Settings mode except the Settings tag) */}
      <div style={S.middle}>
        {isSettings ? (
          <button type="button" onClick={() => onBack()} style={S.backBtn} aria-label="Back to main">
            ← Back
          </button>
        ) : (
          <div style={S.actionsRail} role="toolbar" aria-label="Primary actions">
            <button type="button" style={S.action} onClick={() => onGo('settings')}>Settings</button>
            <button type="button" style={S.action} onClick={() => onGo('missions')}>Missions</button>
            <button type="button" style={S.action} onClick={() => onGo('devices')}>Devices</button>
            <button type="button" style={S.action} onClick={() => onGo('text')}>Text</button>
            <button type="button" style={S.action} onClick={() => onGo('assigned')}>Assigned Media</button>
            <button type="button" style={S.action} onClick={() => onGo('media')}>Media Pool</button>
            <div style={S.railSpacer} />
          </div>
        )}
      </div>

      {/* Right: global save actions + status */}
      <div style={S.right}>
        <button
          type="button"
          onClick={() => (onUpdate ? onUpdate() : onGo('update'))}
          style={S.updateBtn}
          title="Save (stay in current channel)"
        >
          Update
        </button>
        <button
          type="button"
          onClick={() => (onSaveAndPublish ? onSaveAndPublish() : onGo('save_and_publish'))}
          style={S.savePublishBtn}
          title="Save changes and publish live"
        >
          Save &amp; Publish
        </button>
        <div style={S.statusWrap}>
          {statusIsPublished ? (
            <button type="button" style={S.setDraftBtn} onClick={handleSetDraft}>
              Set to Draft mode
            </button>
          ) : (
            <button type="button" style={S.makeLiveBtn} onClick={handleMakeLive}>
              Make Live
            </button>
          )}
          <div style={S.statusColumn}>
            <span style={{ ...S.statusBadge, ...statusStyle }}>{statusLabel}</span>
            <span style={S.statusHint}>{statusHint}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 12px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'saturate(150%) blur(6px)',
    height: 56, // thinner header
    boxSizing: 'border-box',
  },
  left: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  iconWrap: { width: 36, height: 36, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  icon: { width: '100%', height: '100%', objectFit: 'cover' },
  iconPlaceholder: { width: '100%', height: '100%', background: 'linear-gradient(135deg,#e8e8f4,#d9d9ef)' },
  titleWrap: { display: 'flex', flexDirection: 'column', lineHeight: 1 },
  title: { fontSize: 16, fontWeight: 700, color: '#0f172a', letterSpacing: 0.2, whiteSpace: 'nowrap' },
  subtitle: { fontSize: 11, color: '#64748b', letterSpacing: 0.3, whiteSpace: 'nowrap' },

  middle: { flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' },
  actionsRail: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    overflowX: 'auto',
    scrollbarWidth: 'thin',
    padding: '4px 6px',
  },
  action: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid rgba(15,23,42,0.12)',
    background: 'white',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  railSpacer: { width: 10, flex: '0 0 auto' },

  right: { display: 'flex', alignItems: 'center', gap: 12 },
  updateBtn: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 12,
    border: '1px solid rgba(15,23,42,0.12)',
    background: 'white',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  savePublishBtn: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 12,
    border: '1px solid rgba(34,197,94,0.45)',
    background: 'rgba(34,197,94,0.25)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 700,
    color: '#065f46',
  },
  statusWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  statusColumn: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.2,
    gap: 2,
  },
  statusBadge: {
    fontSize: 12,
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid',
    whiteSpace: 'nowrap',
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  statusDraft: {
    color: '#166534',
    borderColor: 'rgba(74, 222, 128, 0.6)',
    background: 'rgba(187, 247, 208, 0.5)',
  },
  statusPublished: {
    color: '#047857',
    borderColor: 'rgba(74, 222, 128, 0.65)',
    background: 'rgba(134, 239, 172, 0.45)',
    boxShadow: '0 0 12px rgba(34, 197, 94, 0.35)',
  },
  statusHint: {
    fontSize: 11,
    color: '#475569',
    whiteSpace: 'nowrap',
  },
  makeLiveBtn: {
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(74, 222, 128, 0.8)',
    background: 'linear-gradient(120deg, rgba(187, 247, 208, 0.92), rgba(134, 239, 172, 0.88))',
    color: '#166534',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 6px 14px rgba(34, 197, 94, 0.25)',
    whiteSpace: 'nowrap',
  },
  setDraftBtn: {
    fontSize: 12,
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(251, 191, 36, 0.6)',
    background: 'linear-gradient(120deg, rgba(253, 230, 138, 0.92), rgba(253, 224, 71, 0.88))',
    color: '#854d0e',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 6px 14px rgba(217, 119, 6, 0.2)',
    whiteSpace: 'nowrap',
  },
  backBtn: {
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid rgba(15,23,42,0.12)',
    background: 'white',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
