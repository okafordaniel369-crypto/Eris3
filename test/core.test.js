'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { tmpDir, newApp, say, profilesFile } = require('../testSupport/helpers');

test('Eris starts, greets, and asks what to call the user', () => {
  const app = newApp(tmpDir());
  const msgs = app.start();
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0], /What should I call you\?/);
});

test('basic input is handled and gets a reply', () => {
  const app = newApp(tmpDir());
  app.start();
  const r = app.handleInput('Hi');
  assert.match(r.reply, /Hello/);
  assert.strictEqual(r.exit, false);
});

test('empty input is ignored without crashing', () => {
  const app = newApp(tmpDir());
  app.start();
  assert.deepStrictEqual(app.handleInput('   '), { reply: null, exit: false });
  assert.deepStrictEqual(app.handleInput(undefined), { reply: null, exit: false });
});

test('unknown messages get a safe, honest reply', () => {
  const app = newApp(tmpDir());
  app.start();
  const reply = say(app, 'purple monkey dishwasher');
  assert.match(reply, /can't interpret that yet/);
});

test('exit words end the session', () => {
  for (const word of ['bye', 'exit', 'goodbye']) {
    const app = newApp(tmpDir());
    app.start();
    assert.strictEqual(app.handleInput(word).exit, true, word);
  }
});

test('an unexpected internal error does not crash the application', () => {
  const broken = { classify: () => { throw new Error('boom'); }, respond: () => ({ reply: 'x' }) };
  const app = newApp(tmpDir(), { responder: broken });
  app.start();
  const r = app.handleInput('hello');
  assert.match(r.reply, /something went wrong/);
  assert.strictEqual(r.exit, false);
});

test('Core works with a replaceable responder (no AI model needed or used)', () => {
  const custom = { classify: () => 'x', respond: () => ({ reply: 'custom reply' }) };
  const app = newApp(tmpDir(), { responder: custom });
  app.start();
  assert.strictEqual(say(app, 'anything at all'), 'custom reply');
});

test('corrupted storage: Eris still starts, reports the problem, and changes nothing', () => {
  const dir = tmpDir();
  fs.writeFileSync(profilesFile(dir), 'garbage{{{');
  const app = newApp(dir);
  const msgs = app.start();
  assert.match(msgs[0], /couldn't load the profile data/);
  assert.match(say(app, "I'm Shadow"), /can't interpret|Hello|sorry/i);
  assert.strictEqual(fs.readFileSync(profilesFile(dir), 'utf8'), 'garbage{{{');
  assert.strictEqual(app.handleInput('/exit').exit, true);
});

test('missing owner with existing profiles: Eris reports it and does not appoint a new owner', () => {
  const dir = tmpDir();
  const a = newApp(dir); a.start(); say(a, "I'm Shadow");
  const data = JSON.parse(fs.readFileSync(profilesFile(dir), 'utf8'));
  data.ownerId = null; data.profiles[0].role = 'User';
  fs.writeFileSync(profilesFile(dir), JSON.stringify(data));
  const b = newApp(dir);
  assert.match(b.start()[0], /owner information is inconsistent/);
  say(b, "I'm Mallory");
  assert.strictEqual(JSON.parse(fs.readFileSync(profilesFile(dir), 'utf8')).ownerId, null);
});

test('tests in this suite use temporary storage, not the real data folder', () => {
  const dir = tmpDir();
  assert.ok(dir.startsWith(require('os').tmpdir()));
  const app = newApp(dir);
  assert.strictEqual(app.dataDir, dir);
});

test('the real terminal entry point starts, accepts input, and exits cleanly', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const dir = tmpDir();
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    input: "Hi\nI'm Shadow\nno title\n/status\n/exit\n",
    encoding: 'utf8',
    env: { ...process.env, ERIS_DATA_DIR: dir },
    timeout: 20000,
  });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /ERIS 3\.0/);
  assert.match(r.stdout, /What should I call you\?/);
  assert.match(r.stdout, /Goodbye, Shadow!/);
  assert.match(r.stdout, /Authentication\s+NOT INSTALLED/);
  assert.ok(fs.existsSync(profilesFile(dir)));
});

test('the terminal exits cleanly when input ends (Ctrl+D)', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
    input: '', encoding: 'utf8', env: { ...process.env, ERIS_DATA_DIR: tmpDir() }, timeout: 20000,
  });
  assert.strictEqual(r.status, 0);
});
