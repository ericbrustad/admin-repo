#!/usr/bin/env node
// Prints toolchain versions at build time; warns (does not fail) if Node is outside the 22.x target.
import { execSync } from "node:child_process";

function safe(cmd) {
  try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

console.log("=== VERCEL BUILD TOOLCHAIN ===");
console.log("node:", process.version);
const corepackV = safe("corepack --version") || "(unavailable)";
const yarnV     = safe("yarn --version") || "(unavailable)";
console.log("corepack:", corepackV);
console.log("yarn:", yarnV);

const major = Number(process.version.slice(1).split(".")[0]);
if (major !== 22) {
  console.warn("WARN: Node runtime is outside the required 22.x target; continuing (non-fatal).");
} else {
  console.log("OK: Node 22.x target confirmed.");
}
console.log("================================");
