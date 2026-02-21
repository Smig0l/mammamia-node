#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const ENV_PATH = path.resolve(__dirname, '../.env');
const BACKUP_SUFFIX = `.bak_${new Date().toISOString().replace(/[:.]/g, '_')}`;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; DomainUpdater/1.0)' };
const TIMEOUT = 12000;

/* Helper to backup file
function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const backupPath = filePath + BACKUP_SUFFIX;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}
*/
// Helper to follow redirects and get final URL
function followRedirect(url) {
  return new Promise((resolve) => {
    let reqModule = url.startsWith('https') ? https : http;
    let req = reqModule.request(url, { headers: HEADERS, timeout: TIMEOUT }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Recursively follow redirect
        followRedirect(res.headers.location).then(resolve);
      } else {
        resolve(normalizeUrl(res.responseUrl || url));
      }
    });
    req.on('error', () => resolve(normalizeUrl(url)));
    req.end();
  });
}

// Normalize URL to scheme + netloc
function normalizeUrl(u) {
  try {
    let parsed = new URL(u);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return u;
  }
}

// Main update logic
async function updateEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`File not found: ${ENV_PATH}`);
    process.exit(1);
  }
  //const backup = backupFile(ENV_PATH);
  //if (backup) console.log(`Backup created: ${path.basename(backup)}`);

  const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
  const domainVarRe = /^(\w+_DOMAIN)\s*=\s*["']([^"']+)["'](.*)$/;
  let updates = [];

  // Find all domain variables
  let domainVars = lines
    .map((line, idx) => {
      const m = line.match(domainVarRe);
      if (m) return { idx, varName: m[1], url: m[2], rest: m[3] };
      return null;
    })
    .filter(Boolean);

  // Follow redirects for each domain
  for (const { idx, varName, url, rest } of domainVars) {
    const finalUrl = await followRedirect(url);
    if (finalUrl !== normalizeUrl(url)) {
      lines[idx] = `${varName} = "${finalUrl}"${rest}`;
      updates.push({ varName, old: url, new: finalUrl });
      console.log(`✅ ${varName}: ${url} → ${finalUrl}`);
    } else {
      console.log(`ℹ️ ${varName}: no change (${url})`);
    }
  }

  // Write updated env file
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
  console.log('💾 env file updated.');
  if (updates.length) {
    console.log('📄 Summary:');
    updates.forEach(u => console.log(` - ${u.varName}: ${u.old} → ${u.new}`));
  } else {
    console.log('🔎 No changes made.');
  }
}

updateEnvFile();