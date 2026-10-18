'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { JsonStore } = require('../src/profiles/jsonStore');
const { ProfileMemory } = require('../src/profiles/profileMemory');
const { IdentityResolver } = require('../src/identity/identityResolver');
const { tmpDir, profilesFile } = require('../testSupport/helpers');

const make = () => {
  const pm = new ProfileMemory(new JsonStore(profilesFile(tmpDir())));
  pm.init();
  return { pm, ir: new IdentityResolver(pm) };
};

test('multiple aliases resolve to the same canonical user ID', () => {
  const { pm, ir } = make();
  const p = pm.createProfile({ name: 'Shadow' });
  pm.setPreferredName(p.id, 'Master Shadow');
  assert.deepStrictEqual(ir.resolve('Shadow'), { status: 'match', candidates: [p.id] });
  assert.deepStrictEqual(ir.resolve('master shadow'), { status: 'match', candidates: [p.id] });
  assert.strictEqual(pm.listProfiles().length, 1);
});

test('unknown names resolve to nothing', () => {
  const { ir } = make();
  assert.strictEqual(ir.resolve('Nobody').status, 'none');
  assert.strictEqual(ir.resolve('').status, 'none');
});

test('two different people with the same name are not merged; the match is ambiguous', () => {
  const { pm, ir } = make();
  const a = pm.createProfile({ name: 'Daniel' });
  const b = pm.createProfile({ name: 'Daniel' });
  assert.notStrictEqual(a.id, b.id);
  assert.strictEqual(pm.listProfiles().length, 2);
  const r = ir.resolve('Daniel');
  assert.strictEqual(r.status, 'ambiguous');
  assert.deepStrictEqual(r.candidates.sort(), [a.id, b.id].sort());
});

test('an alias belonging to one person does not match another person', () => {
  const { pm, ir } = make();
  const a = pm.createProfile({ name: 'Shadow' });
  pm.createProfile({ name: 'Daniel' });
  assert.deepStrictEqual(ir.resolve('Shadow').candidates, [a.id]);
});

test('a resolved name is only a candidate: the resolver never changes profiles', () => {
  const { pm, ir } = make();
  pm.createProfile({ name: 'Shadow' });
  const before = JSON.stringify(pm.listProfiles());
  ir.resolve('Shadow');
  assert.strictEqual(JSON.stringify(pm.listProfiles()), before);
});
