// CODEX NOTE: Shared footer that surfaces repo metadata at the bottom of Settings pages.
import React, { useEffect, useMemo, useState } from 'react';

const INITIAL_META = {
  branch: '',
  commit: '',
  owner: '',
  repo: '',
  vercelUrl: '',
  deploymentUrl: '',
  deploymentState: '',
  fetchedAt: '',
  error: '',
  runtime: {
    node: '',
    npm: '',
    npmPath: '',
    corepack: '',
    pinnedNode: '',
    pinnedNpm: '',
    pinnedYarn: '',
    packageManager: '',
    environment: '',
    platform: '',
  },
};

const styles = {
  footer: {
    marginTop: 24,
    padding: '16px 18px',
    borderRadius: 14,
    border: '1px solid var(--admin-border-soft)',
    background: 'var(--appearance-panel-bg, rgba(15, 23, 42, 0.32))',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  heading: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--admin-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--appearance-font-color, var(--admin-body-color))',
  },
  separator: {
    color: 'var(--admin-muted)',
    fontSize: 12,
  },
  link: {
    color: 'var(--admin-link-color, #60a5fa)',
    textDecoration: 'none',
    fontWeight: 600,
    wordBreak: 'break-word',
  },
  metaLine: {
    fontSize: 12,
    color: 'var(--admin-muted)',
  },
  error: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: 600,
  },
};

function formatLocalDateTime(value) {
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function RepoSnapshotFooter() {
  const [meta, setMeta] = useState(INITIAL_META);

  useEffect(() => {
    let cancelled = false;

    async function loadMeta() {
      const nowIso = new Date().toISOString();
      try {
        const [metaRes, vercelRes] = await Promise.all([
          fetch('/api/admin-meta', { cache: 'no-store', credentials: 'include' }).catch(() => null),
          fetch('/api/vercel-status?project=game', { cache: 'no-store', credentials: 'include' }).catch(() => null),
        ]);

        const metaJson = metaRes ? await metaRes.json().catch(() => ({})) : {};
        const vercelJson = vercelRes ? await vercelRes.json().catch(() => ({})) : {};

        if (cancelled) return;

        const metaOk = metaJson?.ok !== false;
        const vercelOk = vercelJson?.ok !== false;

        const deploymentUrlRaw = vercelJson?.url || '';
        const deploymentUrl = typeof deploymentUrlRaw === 'string' && deploymentUrlRaw
          ? (deploymentUrlRaw.startsWith('http') ? deploymentUrlRaw : `https://${deploymentUrlRaw}`)
          : '';
        const deploymentState = vercelJson?.state || (vercelJson?.disabled ? 'DISABLED' : '');
        const combinedError = (!metaOk && metaJson?.error)
          || (!vercelOk && (vercelJson?.error || vercelJson?.reason))
          || '';

        setMeta((prev) => {
          const base = { ...INITIAL_META, ...(prev || {}) };
          return {
            ...base,
            branch: metaOk && metaJson?.branch ? metaJson.branch : base.branch,
            commit: metaOk && metaJson?.commit ? metaJson.commit : base.commit,
            owner: metaOk && metaJson?.owner ? metaJson.owner : base.owner,
            repo: metaOk && metaJson?.repo ? metaJson.repo : base.repo,
            vercelUrl: metaOk && metaJson?.vercelUrl ? metaJson.vercelUrl : base.vercelUrl,
            deploymentUrl: deploymentUrl || base.deploymentUrl,
            deploymentState: deploymentState ? String(deploymentState).toUpperCase() : base.deploymentState,
            fetchedAt: nowIso,
            error: combinedError || '',
            runtime: metaOk && metaJson?.runtime
              ? { ...(base.runtime || {}), ...metaJson.runtime }
              : base.runtime,
          };
        });
      } catch (err) {
        if (cancelled) return;
        setMeta((prev) => {
          const base = { ...INITIAL_META, ...(prev || {}) };
          return {
            ...base,
            fetchedAt: nowIso,
            error: 'Unable to load deployment status',
          };
        });
      }
    }

    loadMeta();
    const timer = setInterval(loadMeta, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const envValues = useMemo(() => {
    const repoOwner = process.env.NEXT_PUBLIC_REPO_OWNER
      || process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER
      || process.env.NEXT_PUBLIC_GITHUB_OWNER
      || '';
    const repoName = process.env.NEXT_PUBLIC_REPO_NAME
      || process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG
      || process.env.NEXT_PUBLIC_GITHUB_REPO
      || '';
    const ownerRepo = repoName ? (repoOwner ? `${repoOwner}/${repoName}` : repoName) : '';
    const repoUrl = ownerRepo ? `https://github.com/${ownerRepo}` : '';
    const branchName = process.env.NEXT_PUBLIC_REPO_BRANCH
      || process.env.NEXT_PUBLIC_GIT_BRANCH
      || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF
      || '';
    const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA
      || process.env.NEXT_PUBLIC_GIT_COMMIT
      || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      || '';
    const vercelHost = process.env.NEXT_PUBLIC_DEPLOYMENT_URL
      || process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_URL
      || process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL
      || process.env.NEXT_PUBLIC_VERCEL_URL
      || '';
    const vercelUrl = vercelHost
      ? (vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`)
      : '';
    return {
      repoOwner,
      repoName,
      ownerRepo,
      repoUrl,
      branchName,
      commitSha,
      vercelUrl,
    };
  }, []);

  const metaTimestampLabel = meta.fetchedAt ? formatLocalDateTime(meta.fetchedAt) : '';
  const metaNowLabel = formatLocalDateTime(new Date());
  const metaBranchLabel = meta.branch || envValues.branchName || '';
  const metaCommitLabel = meta.commit ? String(meta.commit) : (envValues.commitSha || '');
  const metaCommitShort = metaCommitLabel ? metaCommitLabel.slice(0, 7) : '';
  const metaRepoName = meta.repo ? String(meta.repo) : (envValues.repoName || '');
  const metaOwnerRepo = meta.repo
    ? `${meta.owner ? `${meta.owner}/` : ''}${meta.repo}`
    : envValues.ownerRepo;
  const metaRepoUrl = meta.owner && meta.repo
    ? `https://github.com/${meta.owner}/${meta.repo}`
    : envValues.repoUrl;
  const metaCommitUrl = metaCommitLabel && metaRepoUrl
    ? `${metaRepoUrl}/commit/${metaCommitLabel}`
    : '';
  const metaDeploymentUrl = meta.deploymentUrl || meta.vercelUrl || envValues.vercelUrl || '';
  const metaDeploymentState = meta.deploymentState || (metaDeploymentUrl ? 'UNKNOWN' : '');
  const metaDeploymentLabel = metaDeploymentUrl
    ? metaDeploymentUrl.replace(/^https?:\/\//, '')
    : (metaDeploymentState || '—');
  const metaVercelUrl = meta.vercelUrl || envValues.vercelUrl || '';
  const metaVercelLabel = metaVercelUrl ? metaVercelUrl.replace(/^https?:\/\//, '') : '';

  const metaRuntimeNodeRaw = meta.runtime?.node ? String(meta.runtime.node) : '';
  const metaRuntimeNodeLabel = metaRuntimeNodeRaw
    ? (metaRuntimeNodeRaw.startsWith('v') ? metaRuntimeNodeRaw : `v${metaRuntimeNodeRaw}`)
    : '';
  const metaRuntimeCorepackRaw = meta.runtime?.corepack ? String(meta.runtime.corepack) : '';
  const metaRuntimeCorepackLabel = metaRuntimeCorepackRaw || '';
  const metaRuntimeEnv = meta.runtime?.environment || '';
  const metaRuntimeEnvLabel = metaRuntimeEnv
    ? (metaRuntimeEnv === 'vercel' ? 'Vercel' : metaRuntimeEnv)
    : '';
  const metaRuntimePlatform = meta.runtime?.platform || '';
  const metaPinnedNodeRaw = meta.runtime?.pinnedNode ? String(meta.runtime.pinnedNode) : '';
  const metaPinnedNodeLabel = metaPinnedNodeRaw || '';
  const metaRuntimeNpmRaw = meta.runtime?.npm ? String(meta.runtime.npm) : '';
  const metaRuntimeNpmLabel = metaRuntimeNpmRaw || '';
  const metaRuntimeNpmPathRaw = meta.runtime?.npmPath ? String(meta.runtime.npmPath) : '';
  const metaRuntimeNpmPath = metaRuntimeNpmPathRaw
    ? metaRuntimeNpmPathRaw.split(/\r?\n/).find(Boolean) || ''
    : '';
  const metaPinnedNpmRaw = meta.runtime?.pinnedNpm ? String(meta.runtime.pinnedNpm) : '';
  const metaPinnedNpmLabel = metaPinnedNpmRaw || '';
  const metaPinnedYarnRaw = meta.runtime?.pinnedYarn ? String(meta.runtime.pinnedYarn) : '';
  const metaPinnedYarnLabel = metaPinnedYarnRaw || '';
  const metaRuntimePackageManager = meta.runtime?.packageManager || '';

  const metaRepoDisplay = metaOwnerRepo || envValues.ownerRepo || metaRepoName || envValues.repoName || '—';
  const metaBranchDisplay = metaBranchLabel || envValues.branchName || '—';
  const metaCommitFull = metaCommitLabel || envValues.commitSha || '';
  const metaCommitDisplay = metaCommitShort || (metaCommitFull ? metaCommitFull.slice(0, 7) : '—');
  const metaDeploymentDisplay = metaDeploymentLabel || metaVercelLabel || (envValues.vercelUrl ? envValues.vercelUrl.replace(/^https?:\/\//, '') : '—');
  const metaVercelDisplay = metaVercelLabel || (metaDeploymentDisplay !== '—' ? metaDeploymentDisplay : '');

  const metaSnapshotHasValue = (value) => Boolean(value && value !== '—');
  const metaFooterTimestamp = metaTimestampLabel || metaNowLabel || '—';
  const metaRepoSnapshot = metaSnapshotHasValue(metaRepoDisplay) ? `Repo ${metaRepoDisplay}` : '';
  const metaBranchSnapshot = metaSnapshotHasValue(metaBranchDisplay) ? `Branch ${metaBranchDisplay}` : '';
  const metaCommitSnapshot = metaSnapshotHasValue(metaCommitFull)
    ? `Commit ${metaCommitFull}${metaCommitDisplay && metaCommitDisplay !== metaCommitFull ? ` (${metaCommitDisplay})` : ''}`
    : '';
  const metaDeploymentSnapshot = metaSnapshotHasValue(metaDeploymentDisplay) ? `Deployment ${metaDeploymentDisplay}` : '';
  const metaVercelSnapshot = metaSnapshotHasValue(metaVercelDisplay) && metaVercelDisplay !== metaDeploymentDisplay
    ? `Vercel ${metaVercelDisplay}`
    : '';
  const metaCapturedSnapshot = metaSnapshotHasValue(metaFooterTimestamp) ? `Captured ${metaFooterTimestamp}` : '';
  const metaDevSummaryParts = [
    metaRepoSnapshot,
    metaBranchSnapshot,
    metaCommitSnapshot,
    metaDeploymentSnapshot,
    metaVercelSnapshot,
    metaCapturedSnapshot,
  ].filter(Boolean);
  const metaDevSummary = metaDevSummaryParts.length ? metaDevSummaryParts.join(' • ') : 'Repo snapshot unavailable';

  const metaRepoFooterLabel = metaSnapshotHasValue(metaRepoDisplay) ? metaRepoDisplay : '—';
  const metaBranchFooterLabel = metaSnapshotHasValue(metaBranchDisplay) ? metaBranchDisplay : '—';
  const metaCommitFooterLabel = metaSnapshotHasValue(metaCommitFull)
    ? metaCommitFull
    : (metaSnapshotHasValue(metaCommitDisplay) ? metaCommitDisplay : '—');
  const metaDeploymentFooterLabel = metaSnapshotHasValue(metaDeploymentDisplay) ? metaDeploymentDisplay : '—';
  const metaFooterNowLabel = metaNowLabel || '—';
  const metaDevFooterLine = `Repo: ${metaRepoFooterLabel} • Branch: ${metaBranchFooterLabel} • Commit: ${metaCommitFooterLabel} • Deployment: ${metaDeploymentFooterLabel} • Generated ${metaFooterNowLabel}`;

  return (
    <footer style={styles.footer}>
      <div style={styles.heading}>Repository Snapshot</div>
      {meta.error && <div style={styles.error}>{meta.error}</div>}
      <div style={styles.row}>
        <span style={styles.item}>
          <strong>Repo:</strong>{' '}
          {metaRepoUrl ? (
            <a href={metaRepoUrl} target="_blank" rel="noreferrer" style={styles.link}>
              {metaRepoDisplay}
            </a>
          ) : (
            metaRepoDisplay
          )}
        </span>
        <span style={styles.separator}>•</span>
        <span style={styles.item}>
          <strong>Branch:</strong>{' '}
          {metaBranchDisplay}
        </span>
        <span style={styles.separator}>•</span>
        <span style={styles.item}>
          <strong>Commit:</strong>{' '}
          {metaCommitDisplay !== '—' && metaCommitUrl ? (
            <a href={metaCommitUrl} target="_blank" rel="noreferrer" style={styles.link} title={`Open commit ${metaCommitLabel}`}>
              {metaCommitDisplay}
            </a>
          ) : (
            metaCommitDisplay
          )}
        </span>
        <span style={styles.separator}>•</span>
        <span style={styles.item}>
          <strong>Deployment:</strong>{' '}
          {metaDeploymentDisplay !== '—' && metaDeploymentUrl ? (
            <a
              href={metaDeploymentUrl.startsWith('http') ? metaDeploymentUrl : `https://${metaDeploymentUrl}`}
              target="_blank"
              rel="noreferrer"
              style={styles.link}
            >
              {metaDeploymentDisplay}
            </a>
          ) : (
            metaDeploymentDisplay
          )}
        </span>
        {metaVercelDisplay && (
          <>
            <span style={styles.separator}>•</span>
            <span style={styles.item}>
              <strong>Vercel:</strong>{' '}
              {metaVercelLabel && metaVercelUrl ? (
                <a href={metaVercelUrl} target="_blank" rel="noreferrer" style={styles.link}>
                  {metaVercelDisplay}
                </a>
              ) : (
                metaVercelDisplay
              )}
            </span>
          </>
        )}
      </div>
      <div style={styles.metaLine}>
        Snapshot fetched {metaTimestampLabel || '—'} • Rendered {metaNowLabel || '—'}
      </div>
      <div style={styles.metaLine}>
        Runtime — Node {metaRuntimeNodeLabel || '—'}
        {metaRuntimeEnvLabel ? ` (${metaRuntimeEnvLabel})` : ''}
        {' '}• npm {metaRuntimeNpmLabel || '—'}
        {metaRuntimeNpmPath ? ` @ ${metaRuntimeNpmPath}` : ''}
        {metaRuntimeCorepackLabel ? ` • Corepack ${metaRuntimeCorepackLabel}` : ''}
        {' '}• Platform {metaRuntimePlatform || '—'}
        {' '}• Pinned Node {metaPinnedNodeLabel || '—'}
        {metaPinnedNpmLabel ? ` • Pinned npm ${metaPinnedNpmLabel}` : ''}
        {metaPinnedYarnLabel ? ` • Pinned Yarn ${metaPinnedYarnLabel}` : ''}
      </div>
      {metaRuntimePackageManager && (
        <div style={styles.metaLine}>
          Package manager manifest — {metaRuntimePackageManager}
        </div>
      )}
      <div style={styles.metaLine}>Dev Environment Snapshot — {metaDevSummary}</div>
      <div style={styles.metaLine}>{metaDevFooterLine}</div>
    </footer>
  );
}
