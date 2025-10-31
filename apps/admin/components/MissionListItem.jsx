import React from 'react';

export default function MissionListItem({ mission = {}, onClick = () => {} }) {
  return (
    <div onClick={() => onClick(mission)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 6, overflow: 'hidden', background: '#0b0f11', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {mission.thumbnailUrl ? <img src={mission.thumbnailUrl} alt={mission.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ color: '#6e848b', fontSize: 12 }}>No<br/>Img</div>}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{mission.title}</div>
        <div style={{ fontSize: 12, color: '#9fb0bf' }}>ID: {mission.id}</div>
        {/* bottom spacer / marker for responses */}
        <div style={{ marginTop: 8, height: 34, display: 'flex', alignItems: 'center', gap: 8 }}>
          {mission.hasResponses ? (
            <>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: '#2bc36b' }} />
              <div style={{ fontSize: 12, color: '#cfe8ea' }}>{mission.responseLabel || 'Has Response'}</div>
              {mission.responseThumb ? <img src={mission.responseThumb} alt="resp" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', marginLeft: 8 }} /> : null}
            </>
          ) : null}
        </div>
      </div>

      <div style={{ width: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {mission.isTrigger ? <div style={{ width: 14, height: 14, borderRadius: 3, background: '#ffbf00' }} title="Trigger" /> : null}
      </div>
    </div>
  );
}
