import React from 'react';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|tif|tiff|avif|heic|heif)$/i;

function looksLikeImage(item = {}) {
  const type = String(item.type || '').toLowerCase();
  if (type === 'image' || type === 'gif') return true;
  const src = item.thumbUrl || item.url || item.id || '';
  return IMAGE_EXT.test(String(src).toLowerCase());
}

export default function MediaPool({ media = [], onSelect = () => {} }) {
  return (
    <div
      style={{
        border: 'var(--appearance-panel-border, var(--admin-panel-border))',
        padding: 12,
        borderRadius: 12,
        background: 'var(--appearance-panel-bg, var(--admin-panel-bg))',
        boxShadow: 'var(--appearance-panel-shadow, var(--admin-panel-shadow))',
        color: 'var(--appearance-font-color, var(--admin-body-color))',
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16 }}>Media Pool</div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        {media.map((m) => {
          const previewUrl = m.thumbUrl || m.url || m.id;
          const typeLower = String(m.type || '').toLowerCase();
          const fileNameLower = String(m.fileName || '').toLowerCase();
          const isPlaceholder = typeLower === 'placeholder' || fileNameLower === '.gitkeep';
          const isImage = looksLikeImage(m);
          const isAr = ['ar', 'ar-target', 'ar-overlay'].includes(typeLower);
          const displayType = m.categoryLabel
            || (typeLower === 'ar-target'
              ? 'AR Target'
              : typeLower === 'ar-overlay'
                ? 'AR Overlay'
                : String(m.type || m.category || 'media'));
          const displayId = m.name || m.label || m.id;
          return (
            <div
              key={m.id}
              onClick={() => { if (!isPlaceholder) onSelect(m); }}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--appearance-subpanel-bg, var(--admin-tab-bg))',
                padding: 8,
                cursor: isPlaceholder ? 'default' : 'pointer',
                border: '1px solid var(--admin-border-soft)',
                display: 'grid',
                gap: 6,
              }}
              title={isPlaceholder ? 'Placeholder keep-alive file (read-only)' : undefined}
            >
              <div
                style={{
                  width: '100%',
                  height: 132,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--admin-input-bg)',
                  border: '1px solid var(--admin-border-soft)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {isImage && previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={displayId || 'media preview'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : isAr ? (
                  <div
                    style={{
                      color: 'var(--admin-muted)',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      display: 'grid',
                      gap: 4,
                      placeItems: 'center',
                    }}
                  >
                    <span>{displayType}</span>
                  </div>
                ) : (
                  <div
                    style={{
                      color: 'var(--admin-muted)',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {displayType}
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--appearance-font-color, var(--admin-body-color))',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayId}
              </div>
              {m.slug && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--admin-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`Slug: ${m.slug}`}
                >
                  #{m.slug}
                </div>
              )}
              {Array.isArray(m.tags) && m.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: 999,
                        background: 'var(--admin-border-soft)',
                        color: 'var(--appearance-font-color, var(--admin-body-color))',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  {m.tags.length > 6 && (
                    <span style={{ fontSize: 10, color: 'var(--admin-muted)' }}>+{m.tags.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
