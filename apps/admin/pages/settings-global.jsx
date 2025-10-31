// CODEX NOTE: Settings (Global) page – hosts the inline settings, including
// the "Saved Games" dropdown that lists ALL games.
import React from 'react';
import SavedGamesSelect from '../components/SavedGamesSelect';
import RepoSnapshotFooter from '../components/RepoSnapshotFooter';

const P = {
  page: { padding: 24 },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 16 },
  section: { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 },
};

export default function SettingsGlobalPage() {
  return (
    <div style={P.page}>
      <h1 style={P.h1}>Settings</h1>
      <section style={P.section}>
        <SavedGamesSelect />
      </section>
      <RepoSnapshotFooter />
    </div>
  );
}
