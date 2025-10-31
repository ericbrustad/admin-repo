#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FLAG_JSON = 'json';
const FLAG_FAIL = 'fail';
const FLAG_UPDATE_ALLOWLIST = 'update-allowlist';

function parseArgs(argv) {
  const flags = new Set();
  const options = { allowlist: null };
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const [flag, inlineValue] = arg.split('=');
    switch (flag) {
      case '--json':
        flags.add(FLAG_JSON);
        break;
      case '--fail-on-detect':
      case '--fail':
        flags.add(FLAG_FAIL);
        break;
      case '--allowlist': {
        if (inlineValue) {
          options.allowlist = inlineValue;
        } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
          options.allowlist = args[i + 1];
          i += 1;
        }
        break;
      }
      case '--update-allowlist': {
        flags.add(FLAG_UPDATE_ALLOWLIST);
        if (inlineValue) {
          options.allowlist = inlineValue;
        } else if (!options.allowlist && args[i + 1] && !args[i + 1].startsWith('--')) {
          options.allowlist = args[i + 1];
          i += 1;
        }
        break;
      }
      default:
        break;
    }
  }

  return { flags, options };
}

function isBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
  if (buffer.includes(0)) return true;
  // Permit UTF-8 text files with occasional non-ASCII characters but treat high entropy
  // blobs (e.g. PNGs lacking nulls due to truncation) as binary when non-printables dominate.
  let nonPrintable = 0;
  const len = Math.min(buffer.length, 4096);
  if (len === 0) return false;
  for (let i = 0; i < len; i += 1) {
    const byte = buffer[i];
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte > 126) nonPrintable += 1;
  }
  return nonPrintable / len > 0.3;
}

function humanBytes(size) {
  if (size === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const value = size / Math.pow(1024, i);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

function loadAllowlist(filePath) {
  if (!filePath) return new Set();
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    const raw = readFileSync(resolved, 'utf8');
    const json = JSON.parse(raw);
    const list = Array.isArray(json) ? json : Array.isArray(json?.files) ? json.files : [];
    return new Set(list);
  } catch {
    return new Set();
  }
}

function writeAllowlist(filePath, files) {
  if (!filePath) return;
  const resolved = path.resolve(process.cwd(), filePath);
  const sorted = [...files].sort((a, b) => a.localeCompare(b));
  const payload = JSON.stringify({ files: sorted }, null, 2);
  writeFileSync(resolved, `${payload}\n`, 'utf8');
}

function collectBinaryFiles() {
  const raw = execSync('git ls-files', { encoding: 'utf8' }).trim();
  if (!raw) return [];
  const files = raw.split('\n').filter(Boolean);
  const binaryFiles = [];
  for (const filePath of files) {
    let buffer;
    try {
      buffer = readFileSync(filePath);
    } catch {
      continue;
    }
    if (!isBinary(buffer)) continue;
    const ext = path.extname(filePath).toLowerCase() || '(no ext)';
    binaryFiles.push({
      path: filePath,
      size: buffer.length,
      ext,
      group: filePath.split(path.sep).slice(0, 2).join('/') || filePath,
    });
  }
  return binaryFiles;
}

function renderTable(rows) {
  if (rows.length === 0) return;
  const header = ['Path', 'Size', 'Ext'];
  const widths = [
    Math.max(header[0].length, ...rows.map((row) => row.path.length)),
    Math.max(header[1].length, ...rows.map((row) => row.human.length)),
    Math.max(header[2].length, ...rows.map((row) => row.ext.length)),
  ];
  const pad = (value, width) => value + ' '.repeat(Math.max(0, width - value.length));
  console.log(`${pad(header[0], widths[0])}  ${pad(header[1], widths[1])}  ${pad(header[2], widths[2])}`);
  console.log(`${'-'.repeat(widths[0])}  ${'-'.repeat(widths[1])}  ${'-'.repeat(widths[2])}`);
  for (const row of rows) {
    console.log(`${pad(row.path, widths[0])}  ${pad(row.human, widths[1])}  ${pad(row.ext, widths[2])}`);
  }
}

function main() {
  const { flags, options } = parseArgs(process.argv);
  const wantJson = flags.has(FLAG_JSON);
  const shouldFail = flags.has(FLAG_FAIL);
  const shouldUpdateAllowlist = flags.has(FLAG_UPDATE_ALLOWLIST);

  const binaryFiles = collectBinaryFiles();
  binaryFiles.sort((a, b) => a.path.localeCompare(b.path));

  const allowlist = loadAllowlist(options.allowlist);
  const unexpected = binaryFiles.filter((entry) => !allowlist.has(entry.path));

  if (shouldUpdateAllowlist && options.allowlist) {
    writeAllowlist(options.allowlist, binaryFiles.map((entry) => entry.path));
  }

  if (binaryFiles.length === 0) {
    if (wantJson) {
      console.log(JSON.stringify({ total: 0, unexpected: [], files: [] }, null, 2));
    } else {
      console.log('No binary files detected.');
    }
    return;
  }

  const totals = new Map();
  for (const entry of binaryFiles) {
    totals.set(entry.group, (totals.get(entry.group) || 0) + 1);
  }

  const rows = binaryFiles.map(({ path: filePath, size, ext }) => ({
    path: filePath,
    size,
    human: humanBytes(size),
    ext,
    allowlisted: allowlist.has(filePath),
  }));

  if (wantJson) {
    console.log(
      JSON.stringify(
        {
          total: binaryFiles.length,
          unexpected: unexpected.map((entry) => entry.path),
          totals: Object.fromEntries([...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
          files: rows,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Binary files detected: ${binaryFiles.length}`);
    console.log('\nBy directory slice (first two segments):');
    for (const [group, count] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${group}: ${count}`);
    }

    console.log('\nDetailed list:');
    renderTable(rows);

    if (options.allowlist) {
      if (unexpected.length === 0) {
        console.log(`\nAll binary files are covered by ${options.allowlist}.`);
      } else {
        console.log(`\n${unexpected.length} binary file(s) missing from ${options.allowlist}:`);
        for (const entry of unexpected) {
          console.log(`  - ${entry.path}`);
        }
      }
    } else {
      console.log('\nNo allowlist supplied; every entry is treated as unexpected.');
    }
  }

  if (shouldFail && unexpected.length > 0) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error('Failed to list binary files:', error.message);
  process.exitCode = 1;
}
