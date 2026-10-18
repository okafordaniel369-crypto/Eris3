'use strict';
// Runs the automated tests (one file at a time) and records the real results,
// so /status can report TESTED only for components whose tests actually passed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const SRC_DIR = path.join(__dirname, '..');
const TEST_DIR = path.join(__dirname, '..', '..', 'test');

// A fingerprint of the source code. If the code changes after a test run,
// the old results no longer count and components go back to ACTIVE.
function computeCodeHash(srcDir = SRC_DIR) {
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) files.push(full);
    }
  })(srcDir);
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(srcDir, f)); h.update(fs.readFileSync(f)); }
  return h.digest('hex');
}

function resultsPath(dataDir) { return path.join(dataDir, 'test-results.json'); }

function readResults(dataDir) {
  try { return JSON.parse(fs.readFileSync(resultsPath(dataDir), 'utf8')); } catch (e) { return null; }
}

function runAllTests({ dataDir, testDir = TEST_DIR }) {
  const files = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js')).sort() : [];
  const results = {};
  let pass = 0;
  let fail = 0;
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(testDir, f)], { encoding: 'utf8', timeout: 120000 });
    const out = `${r.stdout || ''}`;
    const p = Number((/^# pass (\d+)/m.exec(out) || [])[1] || 0);
    const fl = Number((/^# fail (\d+)/m.exec(out) || [])[1] || 0);
    const ok = r.status === 0 && fl === 0 && p > 0;
    results[f.replace('.test.js', '')] = { pass: p, fail: fl, ok };
    pass += p;
    fail += fl + (r.status !== 0 && fl === 0 ? 1 : 0);
  }
  const record = { codeHash: computeCodeHash(), ranAt: new Date().toISOString(), results };
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(resultsPath(dataDir), JSON.stringify(record, null, 2));
  } catch (e) { /* recording is best-effort */ }
  return { pass, fail, perFile: results, ranAt: record.ranAt };
}

module.exports = { runAllTests, readResults, computeCodeHash };
