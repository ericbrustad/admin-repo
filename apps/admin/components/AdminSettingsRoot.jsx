import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SettingsMenu from './SettingsMenu';
import GameSelect from './GameSelect';
import HideLegacyButtons from './HideLegacyButtons';

const initialState = {
  slug: 'default',
  channel: 'draft',
  games: [],
  saving: false,
};

export default function AdminSettingsRoot() {
  const [state, setState] = useState(initialState);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    function apply(detail = {}) {
      setState((prev) => ({
        ...prev,
        ...(detail.slug ? { slug: detail.slug } : {}),
        ...(detail.channel ? { channel: detail.channel } : {}),
        ...(Array.isArray(detail.games) ? { games: detail.games } : {}),
        ...(typeof detail.saving === 'boolean' ? { saving: detail.saving } : {}),
      }));
      setRefreshing(false);
    }

    const bridge = window.__esxSettingsBridge;
    if (bridge && typeof bridge.getState === 'function') {
      try {
        const detail = bridge.getState();
        if (detail) apply(detail);
      } catch {}
    }

    function handle(event) {
      if (!event || typeof event.detail !== 'object') return;
      apply(event.detail);
    }

    window.addEventListener('esx:settings:state', handle);
    return () => {
      window.removeEventListener('esx:settings:state', handle);
    };
  }, []);

  const handleOpen = useCallback((slug, channel) => {
    if (typeof window === 'undefined') return;
    const bridge = window.__esxSettingsBridge;
    if (bridge && typeof bridge.openGame === 'function') {
      bridge.openGame(slug, channel);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('erix:open-game', {
        detail: { slug, channel },
      }),
    );
  }, []);

  const handleDelete = useCallback((entry) => {
    if (typeof window === 'undefined') return;
    const bridge = window.__esxSettingsBridge;
    if (bridge && typeof bridge.deleteGame === 'function') {
      bridge.deleteGame(entry);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('erix:delete-game', {
        detail: { slug: entry?.slug, channel: entry?.channel },
      }),
    );
  }, []);

  const handleRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    setRefreshing(true);
    const bridge = window.__esxSettingsBridge;
    if (bridge && typeof bridge.reloadGames === 'function') {
      Promise.resolve(bridge.reloadGames()).finally(() => {
        setTimeout(() => setRefreshing(false), 1200);
      });
      return;
    }
    window.dispatchEvent(new Event('erix:reload-games'));
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  const handleSavePublish = useCallback(() => {
    if (typeof window === 'undefined') return;
    const bridge = window.__esxSettingsBridge;
    const detail = { slug: state.slug, channel: state.channel };
    if (bridge && typeof bridge.saveAndPublish === 'function') {
      bridge.saveAndPublish(detail);
      return;
    }
    window.dispatchEvent(
      new CustomEvent('erix:save-publish-game', {
        detail,
      }),
    );
  }, [state.slug, state.channel]);

  const actionsDisabled = useMemo(() => !!state.saving, [state.saving]);
  const isBrowser = typeof window !== 'undefined';

  return (
    <>
      <HideLegacyButtons />
      {isBrowser && (
        <SettingsMenu>
          <GameSelect
            games={state.games}
            currentSlug={state.slug}
            currentChannel={state.channel}
            onOpen={handleOpen}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
          <div style={styles.actionsGroup}>
            <label style={styles.actionsLabel}>Actions</label>
            <button
              type="button"
              onClick={handleSavePublish}
              disabled={actionsDisabled}
              style={{
                ...styles.actionButton,
                ...(actionsDisabled ? styles.actionButtonDisabled : {}),
              }}
            >
              Save &amp; Publish Game
            </button>
          </div>
        </SettingsMenu>
      )}
    </>
  );
}

const styles = {
  actionsGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  actionsLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--admin-muted, #475569)',
  },
  actionButton: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--admin-border-soft, rgba(148, 163, 184, 0.6))',
    background: 'transparent',
    color: 'var(--appearance-font-color, var(--admin-body-color, #0f172a))',
    cursor: 'pointer',
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
};
