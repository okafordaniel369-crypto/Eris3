'use strict';
// Component status. Labels: ACTIVE, TESTED, INCOMPLETE, NOT INSTALLED, ERROR.
//   TESTED only if the last recorded test run passed for this component
//   AND the source code has not changed since that run.

const { readResults, computeCodeHash } = require('./testRunner');

const COMPONENTS = [
  { name: 'Core (application foundation)', tests: ['core'] },
  { name: 'Commands', tests: ['commands'] },
  { name: 'Basic Conversation (rule-based)', tests: ['conversation'] },
  { name: 'Adaptive Introduction', tests: ['introduction'] },
  { name: 'Identity Resolution', tests: ['identity'] },
  { name: 'Profile Memory', tests: ['profileMemory'], needsProfiles: true },
  { name: 'Profile Storage (JSON)', tests: ['storage'], needsProfiles: true },
  { name: 'Language Understanding', installed: false },
  { name: 'Response Generation', installed: false },
  { name: 'Knowledge', installed: false },
  { name: 'Memory Engine', installed: false },
  { name: 'Reasoning', installed: false },
  { name: 'Learning', installed: false },
  { name: 'Personality', installed: false },
  { name: 'Emotion', installed: false },
  { name: 'Authentication', installed: false },
  { name: 'AI Model Connection', installed: false },
];

function getStatuses({ profiles, dataDir }) {
  const record = readResults(dataDir);
  let currentHash = null;
  try { currentHash = computeCodeHash(); } catch (e) { /* ignore */ }
  const fresh = !!(record && currentHash && record.codeHash === currentHash);

  const rows = COMPONENTS.map((c) => {
    if (c.installed === false) return { name: c.name, label: 'NOT INSTALLED' };
    if (c.needsProfiles && !profiles.isReady()) return { name: c.name, label: 'ERROR' };
    const passed = fresh && c.tests.every((t) => record.results[t] && record.results[t].ok);
    return { name: c.name, label: passed ? 'TESTED' : 'ACTIVE' };
  });

  return {
    rows,
    lastRun: record ? record.ranAt : null,
    stale: !!(record && !fresh),
    problem: profiles.isReady() ? null : profiles.getError().message,
  };
}

function formatStatus(s) {
  const lines = ['Component status:'];
  for (const r of s.rows) lines.push(`  ${r.name.padEnd(34)} ${r.label}`);
  lines.push('');
  if (s.problem) lines.push(`Problem: ${s.problem}`, '');
  if (!s.lastRun) lines.push('Tests have not been run yet. Type /test to run them.');
  else if (s.stale) lines.push(`Tests last ran ${s.lastRun}, but the code has changed since then. Run /test again.`);
  else lines.push(`Tests last ran ${s.lastRun}.`);
  lines.push('ACTIVE = available. TESTED = its tests passed against the current code. Authentication is NOT INSTALLED: selecting a profile does not verify anyone.');
  return lines.join('\n');
}

module.exports = { getStatuses, formatStatus, COMPONENTS };
