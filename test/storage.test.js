'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JsonStore } = require('../src/profiles/jsonStore');
const { ProfileMemory } = require('../src/profiles/profileMemory');
const { tmpDir, newApp, say, profilesFile } = require('../testSupport/helpers');

test('missing storage is treated as a normal first launch', () => {
  const dir = tmpDir();
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(pm.init(), true);
  assert.deepStrictEqual(pm.listProfiles(), []);
  assert.strictEqual(fs.existsSync(profilesFile(dir)), false, 'nothing is written until a profile is created');
});

test('profiles can be saved and loaded', () => {
  const dir = tmpDir();
  const a = new ProfileMemory(new JsonStore(profilesFile(dir)));
  a.init();
  const p = a.createProfile({ name: 'Shadow' });
  const b = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(b.init(), true);
  assert.strictEqual(b.getProfile(p.id).name, 'Shadow');
});

test('malformed JSON gives a safe, understandable error and is not overwritten', () => {
  const dir = tmpDir();
  fs.writeFileSync(profilesFile(dir), '{ this is not json');
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(pm.init(), false);
  assert.strictEqual(pm.getError().code, 'CORRUPT');
  assert.match(pm.getError().message, /not valid JSON/);
  assert.throws(() => pm.createProfile({ name: 'X' }), (e) => e.code === 'UNAVAILABLE');
  assert.strictEqual(fs.readFileSync(profilesFile(dir), 'utf8'), '{ this is not json');
});

test('an empty file is treated as corrupted, not as a fresh start', () => {
  const dir = tmpDir();
  fs.writeFileSync(profilesFile(dir), '');
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(pm.init(), false);
});

test('structurally invalid data is rejected', () => {
  const dir = tmpDir();
  fs.writeFileSync(profilesFile(dir), JSON.stringify({ version: 1, ownerId: null, profiles: [{ id: 'user_001' }] }));
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(pm.init(), false);
  assert.strictEqual(pm.getError().code, 'INVALID');
});

test('existing profiles are not silently overwritten by a new session', () => {
  const dir = tmpDir();
  const app = newApp(dir);
  app.start();
  say(app, "I'm Shadow");
  const before = fs.readFileSync(profilesFile(dir), 'utf8');
  const app2 = newApp(dir);
  app2.start();
  assert.strictEqual(fs.readFileSync(profilesFile(dir), 'utf8'), before);
});

test('a failed save leaves in-memory data unchanged and leaves no temp file behind', () => {
  const dir = tmpDir();
  const failing = { load: () => ({ version: 1, ownerId: null, profiles: [] }), save: () => { throw new Error('disk full'); } };
  const pm = new ProfileMemory(failing);
  pm.init();
  assert.throws(() => pm.createProfile({ name: 'A' }), (e) => e.code === 'WRITE_FAILED');
  assert.strictEqual(pm.listProfiles().length, 0);
  assert.strictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')).length, 0);
});

test('stored file contains no passwords or passcode fields', () => {
  const dir = tmpDir();
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  pm.init();
  pm.createProfile({ name: 'Shadow' });
  const text = fs.readFileSync(profilesFile(dir), 'utf8').toLowerCase();
  assert.ok(!text.includes('password') && !text.includes('passcode'));
});
