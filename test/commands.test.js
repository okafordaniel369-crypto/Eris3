'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { tmpDir, newApp, say } = require('../testSupport/helpers');
const { getStatuses } = require('../src/dev/status');
const { computeCodeHash } = require('../src/dev/testRunner');

const labels = (app) => Object.fromEntries(getStatuses({ profiles: app.profiles, dataDir: app.dataDir }).rows.map((r) => [r.name, r.label]));

test('/help lists every command', () => {
  const app = newApp(tmpDir());
  const out = say(app, '/help');
  for (const c of ['/help', '/status', '/profile', '/test', '/exit']) assert.ok(out.includes(c), c);
});

test('/exit exits', () => {
  const app = newApp(tmpDir());
  assert.strictEqual(app.handleInput('/exit').exit, true);
});

test('unknown commands are handled politely', () => {
  const app = newApp(tmpDir());
  const r = app.handleInput('/dance');
  assert.match(r.reply, /don't know the command/);
  assert.strictEqual(r.exit, false);
});

test('commands are not treated as conversation (and "/exit" text works with spaces)', () => {
  const app = newApp(tmpDir());
  app.start();
  assert.strictEqual(app.handleInput('  /exit  ').exit, true);
});

test('/profile shows the selected profile and withholds gender details', () => {
  const app = newApp(tmpDir());
  app.start();
  say(app, "I'm Shadow"); say(app, 'Master Shadow');
  say(app, 'my gender is private-value'); say(app, 'yes');
  const out = say(app, '/profile');
  assert.match(out, /user_001/);
  assert.match(out, /Master Shadow/);
  assert.match(out, /Owner/);
  assert.match(out, /hidden until authentication exists/);
  assert.doesNotMatch(out, /private-value/);
  assert.match(out, /NOT verified/);
});

test('/profile with no selected profile says so', () => {
  const app = newApp(tmpDir());
  assert.match(say(app, '/profile'), /No profile is selected/);
});

test('/profile never shows another user\'s data', () => {
  const dir = tmpDir();
  const a = newApp(dir); a.start(); say(a, "I'm Shadow"); say(a, 'Master Shadow');
  const b = newApp(dir); b.start();
  assert.doesNotMatch(say(b, '/profile'), /Shadow|user_001/);
});

test('/status: nothing is TESTED before tests have run; advanced engines are NOT INSTALLED', () => {
  const app = newApp(tmpDir());
  const l = labels(app);
  assert.strictEqual(l['Core (application foundation)'], 'ACTIVE');
  assert.strictEqual(l['Profile Memory'], 'ACTIVE');
  for (const n of ['Language Understanding', 'Response Generation', 'Knowledge', 'Memory Engine', 'Reasoning', 'Learning', 'Personality', 'Emotion', 'Authentication', 'AI Model Connection']) {
    assert.strictEqual(l[n], 'NOT INSTALLED', n);
  }
  assert.ok(!Object.values(l).includes('TESTED'));
  assert.match(say(app, '/status'), /Tests have not been run yet/);
});

test('/status: authentication stays NOT INSTALLED even when profiles exist', () => {
  const app = newApp(tmpDir());
  app.start(); say(app, "I'm Shadow");
  assert.strictEqual(labels(app).Authentication, 'NOT INSTALLED');
  assert.match(say(app, '/status'), /selecting a profile does not verify anyone/);
});

test('/status: TESTED appears only for components with a passing, current test record', () => {
  const dir = tmpDir();
  const app = newApp(dir);
  fs.writeFileSync(path.join(dir, 'test-results.json'), JSON.stringify({
    codeHash: computeCodeHash(), ranAt: 'now',
    results: { core: { pass: 3, fail: 0, ok: true }, commands: { pass: 1, fail: 1, ok: false } },
  }));
  const l = labels(app);
  assert.strictEqual(l['Core (application foundation)'], 'TESTED');
  assert.strictEqual(l.Commands, 'ACTIVE', 'failing tests do not count');
  assert.strictEqual(l['Profile Memory'], 'ACTIVE', 'no record for it');
});

test('/status: results go stale (back to ACTIVE) when the code has changed', () => {
  const dir = tmpDir();
  const app = newApp(dir);
  fs.writeFileSync(path.join(dir, 'test-results.json'), JSON.stringify({
    codeHash: 'old-hash', ranAt: 'then', results: { core: { pass: 3, fail: 0, ok: true } },
  }));
  assert.strictEqual(labels(app)['Core (application foundation)'], 'ACTIVE');
  assert.match(say(app, '/status'), /code has changed/);
});

test('/status: shows ERROR for profile components when storage is corrupted', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'profiles.json'), 'nope');
  const app = newApp(dir);
  const l = labels(app);
  assert.strictEqual(l['Profile Memory'], 'ERROR');
  assert.strictEqual(l['Profile Storage (JSON)'], 'ERROR');
  assert.match(say(app, '/status'), /Problem:/);
});

test('/test calls the test runner and reports its real numbers (no invented results)', () => {
  let called = 0;
  const app = newApp(tmpDir(), { runTests: () => { called += 1; return { pass: 7, fail: 2, perFile: { core: { pass: 7, fail: 2, ok: false } } }; } });
  const out = say(app, '/test');
  assert.strictEqual(called, 1);
  assert.match(out, /7 passed, 2 failed/);
  assert.match(out, /FAILED/);
});

test('/test explains itself if no runner is available', () => {
  const app = newApp(tmpDir());
  app.runTests = undefined;
  assert.match(say(app, '/test'), /npm test/);
});
