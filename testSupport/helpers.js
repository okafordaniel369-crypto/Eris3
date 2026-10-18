'use strict';
// Shared helpers for tests. Every test uses a fresh temporary folder, never the real data folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

const made = [];
// Temporary folders are removed automatically when the test process ends.
process.on('exit', () => { for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* ignore */ } } });
const tmpDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'eris3-test-')); made.push(d); return d; };
const newApp = (dir, opts = {}) => createApp({ dataDir: dir, runTests: () => ({ pass: 0, fail: 0, perFile: {} }), ...opts });
const say = (app, text) => app.handleInput(text).reply;
const profilesFile = (dir) => path.join(dir, 'profiles.json');
const readProfiles = (dir) => JSON.parse(fs.readFileSync(profilesFile(dir), 'utf8'));

module.exports = { tmpDir, newApp, say, profilesFile, readProfiles };
