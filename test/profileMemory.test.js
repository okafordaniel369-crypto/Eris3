'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { JsonStore } = require('../src/profiles/jsonStore');
const { ProfileMemory } = require('../src/profiles/profileMemory');
const { tmpDir, profilesFile, readProfiles } = require('../testSupport/helpers');
const fs = require('fs');

const make = (dir = tmpDir()) => {
  const pm = new ProfileMemory(new JsonStore(profilesFile(dir)));
  pm.init();
  return { pm, dir };
};

test('the first profile becomes the Owner', () => {
  const { pm } = make();
  const p = pm.createProfile({ name: 'Shadow' });
  assert.strictEqual(p.role, 'Owner');
  assert.strictEqual(pm.getOwner().id, p.id);
});

test('the owner designation persists after restarting', () => {
  const { pm, dir } = make();
  const p = pm.createProfile({ name: 'Shadow' });
  const again = new ProfileMemory(new JsonStore(profilesFile(dir)));
  again.init();
  assert.strictEqual(again.getOwner().id, p.id);
  assert.strictEqual(again.getOwner().role, 'Owner');
});

test('later profiles default to User and the owner is not replaced', () => {
  const { pm } = make();
  const a = pm.createProfile({ name: 'Shadow' });
  const b = pm.createProfile({ name: 'Daniel' });
  const c = pm.createProfile({ name: 'Sam' });
  assert.strictEqual(b.role, 'User');
  assert.strictEqual(c.role, 'User');
  assert.strictEqual(pm.getOwner().id, a.id);
});

test('ordinary profile creation cannot claim ownership', () => {
  const { pm } = make();
  const a = pm.createProfile({ name: 'Shadow' });
  const b = pm.createProfile({ name: 'Mallory', role: 'Owner', ownerId: 'x' });
  assert.strictEqual(b.role, 'User');
  assert.strictEqual(pm.getOwner().id, a.id);
});

test('each profile gets a unique ID', () => {
  const { pm } = make();
  const ids = ['A', 'B', 'C', 'D'].map((n) => pm.createProfile({ name: n }).id);
  assert.strictEqual(new Set(ids).size, 4);
});

test('separate users keep separate profile data', () => {
  const { pm } = make();
  const a = pm.createProfile({ name: 'Shadow' });
  const b = pm.createProfile({ name: 'Daniel' });
  pm.setPreferredName(a.id, 'Master Shadow');
  pm.setGender(b.id, 'male');
  assert.strictEqual(pm.getProfile(b.id).preferredName, null);
  assert.strictEqual(pm.getProfile(a.id).gender, null);
  assert.ok(!pm.getProfile(b.id).aliases.includes('Master Shadow'));
});

test('unknown fields stay empty (nothing is invented)', () => {
  const { pm } = make();
  const p = pm.createProfile({ preferredName: 'Master Shadow' });
  assert.strictEqual(p.name, null);
  assert.strictEqual(p.gender, null);
  assert.deepStrictEqual(p.preferences, {});
});

test('updating the preferred name keeps the same profile and unrelated data', () => {
  const { pm } = make();
  const p = pm.createProfile({ name: 'Shadow' });
  pm.setGender(p.id, 'private-value');
  pm.setPreferredName(p.id, 'Master Shadow');
  pm.setPreferredName(p.id, 'Shadow');
  assert.strictEqual(pm.listProfiles().length, 1);
  const q = pm.getProfile(p.id);
  assert.strictEqual(q.preferredName, 'Shadow');
  assert.strictEqual(q.gender, 'private-value');
  assert.deepStrictEqual(q.aliases, ['Shadow', 'Master Shadow']);
  assert.ok(q.updatedAt >= q.createdAt);
});

test('duplicate aliases inside one profile are not stored twice', () => {
  const { pm } = make();
  const p = pm.createProfile({ name: 'Shadow' });
  pm.addAlias(p.id, 'shadow');
  pm.addAlias(p.id, 'SHADOW ');
  assert.strictEqual(pm.getProfile(p.id).aliases.length, 1);
});

test('missing owner information while profiles exist is reported, not repaired', () => {
  const { pm, dir } = make();
  pm.createProfile({ name: 'Shadow' });
  const data = readProfiles(dir);
  data.ownerId = null;
  fs.writeFileSync(profilesFile(dir), JSON.stringify(data));
  const bad = new ProfileMemory(new JsonStore(profilesFile(dir)));
  assert.strictEqual(bad.init(), false);
  assert.strictEqual(bad.getError().code, 'OWNER_PROBLEM');
  assert.throws(() => bad.createProfile({ name: 'Mallory' }), (e) => e.code === 'UNAVAILABLE');
  assert.strictEqual(readProfiles(dir).ownerId, null, 'file left as found');
});

test('inconsistent owner data (wrong id, two owners, owner with no profiles) is reported', () => {
  const { pm, dir } = make();
  pm.createProfile({ name: 'Shadow' });
  pm.createProfile({ name: 'Daniel' });
  const base = readProfiles(dir);

  const wrongId = JSON.parse(JSON.stringify(base)); wrongId.ownerId = 'user_999';
  const twoOwners = JSON.parse(JSON.stringify(base)); twoOwners.profiles[1].role = 'Owner';
  const orphan = { version: 1, ownerId: 'user_001', profiles: [] };

  for (const data of [wrongId, twoOwners, orphan]) {
    fs.writeFileSync(profilesFile(dir), JSON.stringify(data));
    const x = new ProfileMemory(new JsonStore(profilesFile(dir)));
    assert.strictEqual(x.init(), false);
    assert.strictEqual(x.getError().code, 'OWNER_PROBLEM');
  }
});
