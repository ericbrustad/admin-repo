import React, { useMemo } from 'react';

/**
 * AssignedMediaTab (drop-in)
 * - Adds "Assign Action Media" under Trigger Automation
 * - Adds an "Action Media" section in Assigned Media
 *
 * EXPECTED PROPS (flexible, safe defaults):
 *   mediaPool: Array<{ id: string, name: string, type?: string, tags?: string[], thumbUrl?: string }>
 *   assigned: {
 *     missionIcons?: string[],
 *     deviceIcons?: string[],
 *     rewardMedia?: string[],
 *     penaltyMedia?: string[],
 *     actionMedia?: string[]
 *   }
 *   onChange: (nextAssigned) => void
 *   triggerEnabled?: boolean
 *   setTriggerEnabled?: (v:boolean) => void
 *   usageSummary?: {
 *     coverImages?: Array<UsageRow>
 *     missionIcons?: Array<UsageRow>
 *     deviceIcons?: Array<UsageRow>
 *     rewardMedia?: Array<UsageRow>
 *     penaltyMedia?: Array<UsageRow>
 *     responseCorrect?: Array<UsageRow>
 *     responseWrong?: Array<UsageRow>
 *     responseAudio?: Array<UsageRow>
 *     actionMedia?: Array<UsageRow>
 *   }
 *
 *   type UsageRow = {
 *     url: string,
 *     label: string,
 *     count: number,
 *     references?: string[],
 *     kind?: string,
 *     thumbUrl?: string,
 *   }
 *
 * You can replace your existing Assigned Media tab component with this one,
 * or mount this alongside and pass-through your data.
 */

function Section({ title, children, style }) {
  return (
    <div
      style={{
        background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
        border: 'var(--appearance-panel-border, var(--admin-panel-border))',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        color: 'var(--appearance-font-color, var(--admin-body-color))',
        boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
        ...style,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Pill({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 999,
        background: 'var(--admin-chip-bg)',
        border: 'var(--admin-chip-border)',
        fontSize: 12,
        color: 'var(--admin-muted)',
      }}
    >
      {children}
    </span>
  );
}

function SmallButton({ children, onClick, tone = 'primary' }) {
  let background = 'var(--admin-button-bg)';
  let border = 'var(--admin-button-border)';
  let color = 'var(--admin-button-color)';

  if (tone === 'danger') {
    background = 'var(--admin-danger-bg)';
    border = 'var(--admin-danger-border)';
    color = 'var(--admin-body-color)';
  } else if (tone === 'success') {
    background = 'var(--admin-success-bg)';
    border = 'var(--admin-success-border, var(--admin-success-bg))';
    color = 'var(--admin-body-color)';
  }

  return (
    <button
      onClick={onClick}
      style={{
        background,
        border,
        padding: '6px 10px',
        borderRadius: 10,
        fontWeight: 600,
        color,
        cursor: 'pointer',
        boxShadow: 'var(--admin-glass-sheen)',
      }}
    >
      {children}
    </button>
  );
}

export default function AssignedMediaTab({
  mediaPool = [],
  assigned = {},
  onChange = () => {},
  triggerEnabled = false,
  setTriggerEnabled = () => {},
  usageSummary = {},
}) {
  const safeAssigned = {
    missionIcons: assigned.missionIcons || [],
    deviceIcons: assigned.deviceIcons || [],
    rewardMedia: assigned.rewardMedia || [],
    penaltyMedia: assigned.penaltyMedia || [],
    actionMedia: assigned.actionMedia || [],
  };

  const {
    coverImages = [],
    missionIcons: missionUsage = [],
    deviceIcons: deviceUsage = [],
    rewardMedia: rewardUsage = [],
    penaltyMedia: penaltyUsage = [],
    responseCorrect: responseCorrectUsage = [],
    responseWrong: responseWrongUsage = [],
    responseAudio: responseAudioUsage = [],
    actionMedia: actionUsage = [],
    arTargets: arTargetUsage = [],
    arOverlays: arOverlayUsage = [],
  } = usageSummary || {};

  const pluralize = (word, count) => (count === 1 ? word : `${word}s`);
  const normalizeMediaId = (value) => {
    if (!value) return '';
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : 'http://local';
      return new URL(String(value), base).toString();
    } catch {
      return String(value || '').trim();
    }
  };

  // "Action" candidates: prefer items with type === 'action' or tag 'action'.
  // Fallback to all media when no action-tagged items exist.
  const actionCandidates = useMemo(() => {
    const tagged = mediaPool.filter(m =>
      (m?.type && String(m.type).toLowerCase()==='action') ||
      (Array.isArray(m?.tags) && m.tags.map(t=>String(t).toLowerCase()).includes('action'))
    );
    return tagged.length ? tagged : mediaPool;
  }, [mediaPool]);

  function assignActionMedia(id) {
    if (!id) return;
    const target = normalizeMediaId(id);
    const alreadyAssigned = safeAssigned.actionMedia.some(existing => normalizeMediaId(existing) === target);
    if (alreadyAssigned) return;
    const next = { ...safeAssigned, actionMedia: [...safeAssigned.actionMedia, id] };
    onChange(next);
  }

  function removeActionMedia(id) {
    const target = normalizeMediaId(id);
    const next = {
      ...safeAssigned,
      actionMedia: safeAssigned.actionMedia.filter(x => normalizeMediaId(x) !== target),
    };
    onChange(next);
  }

  const idToObj = (id) => mediaPool.find(m => m.id === id) || { id, name: id };

  const actionOverview = actionUsage.length
    ? actionUsage
    : (() => {
        if (!safeAssigned.actionMedia.length) return [];
        const counts = safeAssigned.actionMedia.reduce((acc, key) => {
          const normalized = normalizeMediaId(key);
          if (!normalized) return acc;
          if (!acc[normalized]) acc[normalized] = { ids: [], count: 0 };
          acc[normalized].count += 1;
          acc[normalized].ids.push(key);
          return acc;
        }, {});
        return Object.entries(counts).map(([normalized, details]) => {
          const firstId = details.ids[0];
          const media = idToObj(firstId);
          const openUrl = media.openUrl || media.url || media.id || firstId || normalized;
          const tags = Array.isArray(media.tags)
            ? Array.from(new Set(media.tags.map((tag) => String(tag || '').trim()).filter(Boolean)))
            : [];
          return {
            url: openUrl,
            label: media.name || media.id || 'Action media',
            count: details.count,
            references: [],
            kind: media.type || '',
            thumbUrl: media.thumbUrl || openUrl,
            tags,
            removeKey: normalized,
          };
        });
      })();

  const taggedUsageCounts = useMemo(() => {
    const allItems = [
      ...(coverImages || []),
      ...(missionUsage || []),
      ...(deviceUsage || []),
      ...(rewardUsage || []),
      ...(penaltyUsage || []),
      ...(responseCorrectUsage || []),
      ...(responseWrongUsage || []),
      ...(responseAudioUsage || []),
      ...(actionOverview || []),
      ...(arTargetUsage || []),
      ...(arOverlayUsage || []),
    ];

    const responseTrigger = new Set();
    const geoTrigger = new Set();

    allItems.forEach((item = {}) => {
      if (!item.count) return;
      const tagList = Array.isArray(item.tags) ? item.tags : [];
      tagList
        .map((tag) => String(tag || '').toLowerCase())
        .forEach((tag) => {
          if (tag === 'response-trigger') responseTrigger.add(item.url || item.label);
          if (tag === 'geotrigger-device') geoTrigger.add(item.url || item.label);
        });
    });

    return {
      responseTriggers: responseTrigger.size,
      geoTriggers: geoTrigger.size,
    };
  }, [
    coverImages,
    missionUsage,
    deviceUsage,
    rewardUsage,
    penaltyUsage,
    responseCorrectUsage,
    responseWrongUsage,
    responseAudioUsage,
    actionOverview,
    arTargetUsage,
    arOverlayUsage,
  ]);

  function renderUsageSection(title, items, {
    emptyLabel,
    noun,
    allowRemove = false,
    onRemove = () => {},
    showTags = true,
    showThumbnail = true,
  } = {}) {
    const source = Array.isArray(items) ? items : [];
    const filtered = source.filter((item) => (item?.count || 0) > 0);
    const totalUses = filtered.reduce((acc, item) => acc + (item?.count || 0), 0);

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <Pill>{filtered.length} {filtered.length === 1 ? 'item' : 'items'}</Pill>
          <Pill>{totalUses} {pluralize('use', totalUses)}</Pill>
        </div>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--admin-muted)' }}>{emptyLabel}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {filtered.map((item) => {
              const itemKey = item.url || item.removeKey || `${item.label || 'item'}-${item.count}`;
              const descriptor = noun ? `${pluralize(noun, item.count)}` : pluralize('use', item.count);
              const referencePreview = item.references?.length ? item.references.slice(0, 3) : [];
              const overflow = item.references && item.references.length > 3
                ? ` +${item.references.length - 3}`
                : '';
              const tags = Array.isArray(item.tags)
                ? Array.from(new Set(item.tags.map((tag) => String(tag || '').trim()).filter(Boolean)))
                : [];
              const shouldShowTags = showTags;
              return (
                <div
                  key={itemKey}
                  style={{
                    background: 'var(--appearance-subpanel-bg, var(--admin-tab-bg))',
                    border: '1px solid var(--admin-border-soft)',
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: showThumbnail ? '64px 1fr' : '1fr', gap: 12, alignItems: 'center' }}>
                    {showThumbnail && (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 10,
                          overflow: 'hidden',
                          display: 'grid',
                          placeItems: 'center',
                          background: 'var(--admin-input-bg)',
                          border: '1px solid var(--admin-border-soft)',
                        }}
                      >
                        {item.thumbUrl ? (
                          <img src={item.thumbUrl} alt={item.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : item.kind === 'audio' ? (
                          <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Audio</span>
                        ) : item.kind === 'ar' ? (
                          <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>AR</span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>No preview</span>
                        )}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                        Used by {item.count} {descriptor}
                      </div>
                      {referencePreview.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--admin-muted)' }}>
                          {referencePreview.join(', ')}{overflow}
                        </div>
                      )}
                    </div>
                  </div>
                  {shouldShowTags && (
                    <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                      {tags.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--admin-muted)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--appearance-font-color, var(--admin-body-color))' }}>
                            Uncategorized
                          </span>
                          <span style={{ marginLeft: 6 }}>× {item.count}</span>
                        </div>
                      ) : (
                        tags.map((tag) => (
                          <div
                            key={`${itemKey}-tag-${tag}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--admin-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--appearance-font-color, var(--admin-body-color))' }}>
                              {tag}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--appearance-font-color, var(--admin-body-color))' }}>
                              × {item.count}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <SmallButton
                      onClick={() => {
                        const target = item.url || item.removeKey;
                        if (!target) return;
                        if (typeof window !== 'undefined') window.open(target, '_blank');
                      }}
                    >
                      Open
                    </SmallButton>
                    {allowRemove && (
                      <SmallButton tone="danger" onClick={() => onRemove(item.removeKey || item.url)}>Remove</SmallButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ color: 'var(--appearance-font-color, var(--admin-body-color))' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Pill>Response Triggers · {taggedUsageCounts.responseTriggers}</Pill>
        <Pill>GeoTrigger Devices · {taggedUsageCounts.geoTriggers}</Pill>
      </div>
      {/* Trigger Automation */}
      <Section title="Trigger Automation">
        <label style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, color: 'var(--appearance-font-color, var(--admin-body-color))' }}>
          <input type="checkbox" checked={!!triggerEnabled} onChange={e=>setTriggerEnabled(e.target.checked)} />
          <span>Enable Assigned Media Trigger — instantly link media, devices, and missions.</span>
        </label>
        <div style={{ fontSize:12, color:'var(--admin-muted)', marginBottom:12 }}>
          Toggle on to coordinate triggers across media, devices, and missions.
        </div>

        {/* NEW: Assign Action Media (dropdown) */}
        <div style={{ marginTop:12 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Assign Action Media</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
            <select
              onChange={(e)=> assignActionMedia(e.target.value)}
              defaultValue=""
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: 'var(--admin-input-border)',
                background: 'var(--admin-input-bg)',
                color: 'var(--admin-input-color)',
              }}
            >
              <option value="" disabled>Select action media…</option>
              {actionCandidates.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
            <Pill>{safeAssigned.actionMedia.length} assigned</Pill>
          </div>
          <div style={{ fontSize:12, color:'var(--admin-muted)', marginTop:6 }}>
            Choose one or more media items to be used as **Action Media** (e.g., sound effects, short clips, effects).
          </div>
        </div>
      </Section>

      {/* Assigned Media Overview */}
      <Section title="Assigned Media Overview">
        {renderUsageSection('Cover Art', coverImages, {
          emptyLabel: 'No cover art selected.',
          noun: 'cover assignment',
          showThumbnail: false,
        })}
        {renderUsageSection('Mission Media', missionUsage, {
          emptyLabel: 'No mission media assigned.',
          noun: 'mission',
          showTags: true,
        })}
        {renderUsageSection('Device Media', deviceUsage, {
          emptyLabel: 'No device media assigned.',
          noun: 'device',
          showTags: true,
        })}
        {renderUsageSection('Rewards Pool Media', rewardUsage, {
          emptyLabel: 'Rewards pool is empty.',
          noun: 'reward slot',
          showTags: true,
        })}
        {renderUsageSection('Penalties Pool Media', penaltyUsage, {
          emptyLabel: 'Penalties pool is empty.',
          noun: 'penalty slot',
          showTags: true,
        })}
        {renderUsageSection('Response Media — Correct', responseCorrectUsage, {
          emptyLabel: 'No mission response media for correct answers.',
          noun: 'mission response',
        })}
        {renderUsageSection('Response Media — Wrong', responseWrongUsage, {
          emptyLabel: 'No mission response media for incorrect answers.',
          noun: 'mission response',
        })}
        {renderUsageSection('Response Audio', responseAudioUsage, {
          emptyLabel: 'No mission response audio assigned.',
          noun: 'mission response',
        })}
        {renderUsageSection('Action Media', actionOverview, {
          emptyLabel: 'No action media assigned yet.',
          noun: 'trigger',
          allowRemove: true,
          onRemove: removeActionMedia,
        })}
        {renderUsageSection('AR Targets', arTargetUsage, {
          emptyLabel: 'No AR targets assigned yet.',
          noun: 'AR marker',
        })}
        {renderUsageSection('AR Overlays', arOverlayUsage, {
          emptyLabel: 'No AR overlays assigned yet.',
          noun: 'AR overlay',
        })}
      </Section>
    </div>
  );
}
