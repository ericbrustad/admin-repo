// pages/api/admin-meta.js
// Surface repo + deployment metadata for the admin banner. During local
// development we also attempt to pull the active git branch/commit so the
// Settings footer can always render an accurate snapshot even without Vercel
// provided environment variables.

import { execSync } from 'node:child_process';
import process from 'node:process';

import packageJson from '../../../../package.json' assert { type: 'json' };

function safeExec(command) {
  try {
    return execSync(command, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    return '';
  }
}

function parseRemote(remoteUrl = '') {
  if (!remoteUrl) return { owner: '', repo: '' };
  const cleaned = remoteUrl.replace(/\.git$/, '');
  try {
    if (/^git@/i.test(cleaned)) {
      const [, path = ''] = cleaned.split(':');
      const [owner = '', repo = ''] = path.split('/');
      return { owner, repo };
    }
    if (/^https?:\/\//i.test(cleaned)) {
      const url = new URL(cleaned);
      const parts = url.pathname.replace(/^\/+/, '').split('/');
      const [owner = '', repo = ''] = parts;
      return { owner, repo };
    }
  } catch (error) {
    // fall through to default empty owner/repo
  }
  return { owner: '', repo: '' };
}

function detectGitMetadata() {
  const branch = safeExec('git rev-parse --abbrev-ref HEAD');
  const commit = safeExec('git rev-parse HEAD');
  const remote = safeExec('git config --get remote.origin.url');
  const { owner, repo } = parseRemote(remote);
  return { branch, commit, owner, repo };
}

function buildRuntimeMetadata() {
  const nodeVersion = process.version || '';
  const npmVersion = safeExec('npm --version');
  const npmPathRaw = process.platform === 'win32'
    ? safeExec('where npm')
    : safeExec('command -v npm');
  const npmPath = npmPathRaw.split(/\r?\n/).find(Boolean) || '';
  const corepackVersion = safeExec('corepack --version');
  const pinnedNode = packageJson?.volta?.node || '';
  const pinnedYarn = packageJson?.volta?.yarn || '';
  const packageManager = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager
    : '';
  const pinnedNpm = packageManager.startsWith('npm@')
    ? packageManager.split('@')[1] || ''
    : '';

  return {
    node: nodeVersion,
    npm: npmVersion,
    npmPath,
    corepack: corepackVersion,
    pinnedNode,
    pinnedNpm,
    pinnedYarn,
    packageManager,
    environment: process.env.VERCEL ? 'vercel' : (process.env.NODE_ENV || 'development'),
    platform: `${process.platform} ${process.arch}`,
  };
}

export default async function handler(req, res) {
  try {
    const gitMeta = detectGitMetadata();
    const branch = (
      process.env.REPO_BRANCH ||
      process.env.GITHUB_BRANCH ||
      process.env.VERCEL_GIT_COMMIT_REF ||
      process.env.COMMIT_REF ||
      gitMeta.branch ||
      'main'
    );
    const commit = (
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GITHUB_SHA ||
      process.env.COMMIT_SHA ||
      gitMeta.commit ||
      ''
    );
    const owner = (
      process.env.REPO_OWNER ||
      process.env.VERCEL_GIT_REPO_OWNER ||
      gitMeta.owner ||
      ''
    );
    const repo = (
      process.env.REPO_NAME ||
      process.env.VERCEL_GIT_REPO_SLUG ||
      gitMeta.repo ||
      process.env.npm_package_name ||
      ''
    );
    const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    const deploymentUrl = (
      process.env.DEPLOYMENT_URL ||
      process.env.VERCEL_DEPLOYMENT_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_BRANCH_URL ||
      vercelUrl
    );
    const deploymentState = process.env.DEPLOYMENT_STATE || process.env.VERCEL_ENV || '';

    res.status(200).json({
      ok: true,
      branch,
      commit,
      owner,
      repo,
      vercelUrl,
      deploymentUrl,
      deploymentState,
      runtime: buildRuntimeMetadata(),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(200).json({ ok: false, error: err?.message || 'failed to read admin meta' });
  }
}
