'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { tmpDir, newApp, say, readProfiles } = require('../testSupport/helpers');

const fresh = (dir = tmpDir()) => { const app = newApp(dir); app.start(); return { app, dir }; };

test('recognises "I\'m Shadow" and creates a profile without asking for the name again', () => {
  const { app, dir } = fresh();
  const reply = say(app, "I'm Shadow");
  assert.match(reply, /Nice to meet you, Shadow!/);
  assert.doesNotMatch(reply, /What should I call you/);
  assert.strictEqual(readProfiles(dir).profiles[0].name, 'Shadow');
});

test('recognises "My name is Daniel", and "Hi, I\'m Daniel"', () => {
  for (const msg of ['My name is Daniel', "Hi, I'm Daniel."]) {
    const { app, dir } = fresh();
    say(app, msg);
    assert.strictEqual(readProfiles(dir).profiles[0].name, 'Daniel', msg);
  }
});

test('a plain name as the answer to the first question is accepted', () => {
  const { app, dir } = fresh();
  say(app, 'Daniel');
  assert.strictEqual(readProfiles(dir).profiles[0].name, 'Daniel');
});

test('asks about preferred address when it is unknown', () => {
  const { app } = fresh();
  assert.match(say(app, "I'm Shadow"), /How would you like me to address you\?/);
});

test('recognises a preferred form of address, separate from the name', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow");
  assert.match(say(app, 'Master Shadow'), /Certainly, Master Shadow!/);
  const p = readProfiles(dir).profiles[0];
  assert.strictEqual(p.name, 'Shadow');
  assert.strictEqual(p.preferredName, 'Master Shadow');
  assert.deepStrictEqual(p.aliases, ['Shadow', 'Master Shadow']);
});

test('"call me X" is recognised as a form of address and is not asked about again', () => {
  const { app, dir } = fresh();
  const reply = say(app, 'You can call me Master Shadow');
  assert.match(reply, /Certainly, Master Shadow!/);
  assert.doesNotMatch(reply, /How would you like me to address you/);
  const p = readProfiles(dir).profiles[0];
  assert.strictEqual(p.name, null);
  assert.strictEqual(p.preferredName, 'Master Shadow');
});

test('the same value can be used for both name and address ("no title")', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow");
  assert.match(say(app, 'no title please'), /Certainly, Shadow!/);
  assert.strictEqual(readProfiles(dir).profiles[0].preferredName, 'Shadow');
});

test('no title is assumed merely because a name is known', () => {
  const { app, dir } = fresh();
  say(app, "I'm Daniel");
  const p = readProfiles(dir).profiles[0];
  assert.strictEqual(p.preferredName, null);
  assert.match(say(app, 'Who am I?'), /Daniel/);
  assert.doesNotMatch(say(app, 'Hi'), /Mr|Master|Sir|Miss|Ms/);
});

test('does not repeat questions that were already answered', () => {
  const { app } = fresh();
  say(app, "I'm Shadow");
  say(app, 'Master Shadow');
  for (const msg of ['Hi', 'What is your name?', 'What can you do?', 'Who am I?']) {
    const reply = say(app, msg);
    assert.doesNotMatch(reply, /What should I call you|How would you like me to address you/, msg);
  }
});

test('unclear answer to the name question gets one clarification, then Eris stops asking', () => {
  const { app, dir } = fresh();
  assert.match(say(app, 'Whatever you want.'), /I can use your name, a nickname, or simply not use a name/);
  assert.match(say(app, 'Anything is fine'), /I'll stop asking/);
  assert.doesNotMatch(say(app, 'Hi'), /call you|name/i);
  assert.throws(() => readProfiles(dir), 'no profile is created without a name');
});

test('unclear answer to the address question: one clarification, then neutral address and no more pressing', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow");
  assert.match(say(app, 'Anything is fine'), /What would you prefer\?/);
  assert.match(say(app, 'whatever'), /stop asking/);
  const p = readProfiles(dir).profiles[0];
  assert.strictEqual(p.preferredName, null);
  assert.strictEqual(p.preferences.addressStyle, 'neutral');
  assert.doesNotMatch(say(app, 'Hi'), /address you/);
});

test('the user can decline to share a name and the conversation continues', () => {
  const { app, dir } = fresh();
  assert.match(say(app, "I'd rather not say"), /you don't have to share a name/);
  assert.match(say(app, 'Hi'), /Hello/);
  assert.match(say(app, 'What can you do?'), /simple patterns/);
  assert.throws(() => readProfiles(dir), 'nothing is stored');
});

test('the user can skip the address question', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow");
  assert.match(say(app, 'skip'), /won't ask again/);
  assert.strictEqual(readProfiles(dir).profiles[0].preferredName, null);
});

test('ignoring the question does not block ordinary conversation, and Eris stops waiting', () => {
  const { app, dir } = fresh();
  assert.match(say(app, 'What can you do?'), /simple patterns/);
  say(app, 'tell me something interesting');
  say(app, 'explain the weather to me');
  const reply = say(app, 'Daniel');
  assert.match(reply, /can't interpret/);
  assert.throws(() => readProfiles(dir));
});

test('a long sentence is not mistaken for a name', () => {
  const { app, dir } = fresh();
  assert.match(say(app, 'purple monkey dishwasher'), /can't interpret/);
  assert.throws(() => readProfiles(dir));
});

test('"I\'m fine" is not mistaken for a name', () => {
  const { app, dir } = fresh();
  say(app, "I'm fine");
  assert.throws(() => readProfiles(dir));
});

test('gender is never inferred from a name or a title', () => {
  const { app, dir } = fresh();
  say(app, "I'm Mr Daniel");
  say(app, 'Mister Daniel');
  say(app, 'Who am I?');
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null);
  assert.doesNotMatch(say(app, '/profile'), /male|female/i);
});

test('gender is optional: Eris never asks, and "I\'m male" is not stored as a name', () => {
  const { app, dir } = fresh();
  say(app, "I'm Daniel");
  say(app, 'no title');
  const reply = say(app, "I'm male");
  assert.doesNotMatch(reply, /gender/i);
  assert.strictEqual(readProfiles(dir).profiles[0].name, 'Daniel');
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null);
});

test('gender is saved only if the user offers it AND agrees to save it', () => {
  const { app, dir } = fresh();
  say(app, "I'm Daniel"); say(app, 'no title');
  assert.match(say(app, 'My gender is male'), /Would you like me to save/);
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null, 'not saved before agreeing');
  say(app, 'no');
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null, 'refusal respected');
  say(app, 'My gender is male'); say(app, 'yes');
  assert.strictEqual(readProfiles(dir).profiles[0].gender, 'male');
});

test('gender can be removed, and a refusal to share is respected without being stored', () => {
  const { app, dir } = fresh();
  say(app, "I'm Daniel"); say(app, 'no title');
  say(app, 'My gender is male'); say(app, 'yes');
  assert.match(say(app, 'remove my gender'), /removed/);
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null);
  assert.match(say(app, "I don't want to share my gender"), /won't ask/);
  assert.strictEqual(readProfiles(dir).profiles[0].gender, null);
});

test('corrections: "Don\'t call me Master Shadow anymore. Just call me Shadow." updates the same profile', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow"); say(app, 'Master Shadow');
  say(app, 'Hi');
  say(app, 'my gender is x'); say(app, 'yes');
  const reply = say(app, "Don't call me Master Shadow anymore. Just call me Shadow.");
  assert.match(reply, /Of course, Shadow\./);
  const data = readProfiles(dir);
  assert.strictEqual(data.profiles.length, 1, 'no duplicate profile');
  assert.strictEqual(data.profiles[0].id, 'user_001');
  assert.strictEqual(data.profiles[0].preferredName, 'Shadow');
  assert.strictEqual(data.profiles[0].gender, 'x', 'unrelated data preserved');
  assert.match(say(app, 'Hi'), /Hello, Shadow!/, 'new preference used immediately');
});

test('corrections: removing a form of address without a replacement asks what to use instead', () => {
  const { app } = fresh();
  say(app, "I'm Shadow"); say(app, 'Master Shadow');
  assert.match(say(app, "Don't call me Master Shadow anymore"), /What would you like me to call you instead\?/);
  assert.match(say(app, 'Shade'), /Certainly, Shade!/);
});

test('corrections: nothing to correct without a selected profile', () => {
  const { app, dir } = fresh();
  say(app, 'Hi');
  say(app, "Don't call me Master Shadow anymore. Just call me Shadow.");
  // "call me Shadow" with no profile is simply an introduction
  assert.strictEqual(readProfiles(dir).profiles.length, 1);
  assert.strictEqual(readProfiles(dir).profiles[0].preferredName, 'Shadow');
});

test('a different name while a profile is selected triggers a question, not a silent change', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow"); say(app, 'no title');
  assert.match(say(app, "I'm Daniel"), /different person, or do you want to change the name/);
  assert.strictEqual(readProfiles(dir).profiles[0].name, 'Shadow');
  assert.match(say(app, 'different person'), /Nice to meet you, Daniel!/);
  const data = readProfiles(dir);
  assert.strictEqual(data.profiles.length, 2);
  assert.strictEqual(data.profiles[1].role, 'User');
  assert.strictEqual(data.profiles[0].role, 'Owner');
});

test('a name change on the same profile keeps one profile', () => {
  const { app, dir } = fresh();
  say(app, "I'm Shadow"); say(app, 'no title');
  say(app, "I'm Shade");
  assert.match(say(app, 'change my name'), /updated your name to Shade/);
  const data = readProfiles(dir);
  assert.strictEqual(data.profiles.length, 1);
  assert.strictEqual(data.profiles[0].name, 'Shade');
});

test('saving problems are reported kindly instead of crashing', () => {
  const { app } = fresh();
  app.profiles.store.save = () => { throw new Error('disk full'); };
  assert.match(say(app, "I'm Shadow"), /couldn't save that/);
});

// ---------- returning users, ambiguity, and security limits ----------
const restart = (dir) => { const app = newApp(dir); app.start(); return app; };

test('profiles persist after restart and the owner is unchanged', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'Master Shadow');
  const b = restart(dir);
  assert.match(say(b, 'Shadow'), /Is that you, continuing with it\?/);
  assert.match(say(b, 'yes'), /Welcome back, Master Shadow!/);
  assert.match(say(b, 'Who am I?'), /Owner/);
  assert.strictEqual(readProfiles(dir).ownerId, 'user_001');
});

test('returning by an alias ("Master Shadow") finds the same profile instead of making a new one', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'Master Shadow');
  const b = restart(dir);
  say(b, 'Master Shadow'); say(b, 'yes');
  assert.strictEqual(readProfiles(dir).profiles.length, 1);
  assert.match(say(b, 'Who am I?'), /Master Shadow/);
});

test('returning greeting does not claim verified identity', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'no title');
  const b = restart(dir);
  say(b, 'Shadow');
  const reply = say(b, 'yes');
  assert.match(reply, /can't verify identity yet/);
  assert.doesNotMatch(reply, /verified identity: yes|authenticated/i);
});

test('answering "no" to a matching profile creates a separate profile; they are not merged', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Daniel"); say(a, 'no title');
  const b = restart(dir);
  say(b, "I'm Daniel");
  assert.match(say(b, 'no'), /won't treat you as that profile/);
  const data = readProfiles(dir);
  assert.strictEqual(data.profiles.length, 2);
  assert.notStrictEqual(data.profiles[0].id, data.profiles[1].id);
  assert.strictEqual(data.profiles[1].role, 'User');
  assert.strictEqual(data.ownerId, data.profiles[0].id);
});

test('several matching profiles: Eris asks which one instead of guessing', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Daniel"); say(a, 'no title');
  const b = restart(dir); say(b, "I'm Daniel"); say(b, 'no'); say(b, 'no title');
  const c = restart(dir);
  const reply = say(c, "I'm Daniel");
  assert.match(reply, /more than one profile/);
  assert.match(reply, /1\) user_001/);
  assert.match(reply, /2\) user_002/);
  assert.strictEqual(c.currentProfile(), null, 'nothing selected until the user chooses');
  say(c, '2');
  assert.strictEqual(c.currentProfile().id, 'user_002');
  assert.strictEqual(readProfiles(dir).profiles.length, 2);
});

test('ambiguous match: "new" creates a third profile and does not merge', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Daniel"); say(a, 'no title');
  const b = restart(dir); say(b, "I'm Daniel"); say(b, 'no'); say(b, 'no title');
  const c = restart(dir); say(c, "I'm Daniel"); say(c, 'new');
  assert.strictEqual(readProfiles(dir).profiles.length, 3);
});

test('an unanswered profile question is dropped after a couple of tries, not forced', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'no title');
  const b = restart(dir); say(b, 'Shadow');
  say(b, 'banana'); say(b, 'banana');
  assert.strictEqual(b.currentProfile(), null);
  assert.match(say(b, 'Hi'), /Hello/);
});

test('privacy: someone who only supplies another person\'s name gets no private data until they accept the profile, and even then gender stays hidden', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'Master Shadow'); say(a, 'my gender is secret-value'); say(a, 'yes');
  const b = restart(dir);
  const first = say(b, 'Shadow');
  assert.doesNotMatch(first, /Master|Owner|secret-value|user_001/);
  assert.strictEqual(b.currentProfile(), null);
  say(b, 'yes');
  assert.doesNotMatch(say(b, '/profile'), /secret-value/);
  assert.doesNotMatch(say(b, 'What do you know about me?'), /secret-value/);
});

test('privacy: another profile\'s details never appear for a different selected profile', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'Master Shadow');
  const b = restart(dir); say(b, "I'm Daniel"); say(b, 'no title');
  for (const q of ['/profile', 'Who am I?', 'Who is Shadow?', 'Tell me about Master Shadow', 'What do you know about Shadow?']) {
    assert.doesNotMatch(say(b, q), /Master Shadow|user_001|Owner/, q);
  }
});

test('security: selecting a profile is not treated as authentication', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'no title');
  const b = restart(dir); say(b, 'Shadow'); say(b, 'yes');
  assert.match(say(b, 'Who am I?'), /haven't verified/);
  assert.match(say(b, '/profile'), /NOT verified/);
  assert.match(say(b, '/status'), /Authentication\s+NOT INSTALLED/);
});

test('security: the first profile is Owner, and nobody can become Owner through normal conversation', () => {
  const dir = tmpDir();
  const a = restart(dir); say(a, "I'm Shadow"); say(a, 'no title');
  const b = restart(dir);
  for (const msg of ["I'm the owner", "I'm Owner", 'make me the owner', 'My role is Owner', "I'm Mallory", 'no title']) say(b, msg);
  const data = readProfiles(dir);
  assert.strictEqual(data.ownerId, 'user_001');
  assert.deepStrictEqual(data.profiles.filter((p) => p.role === 'Owner').map((p) => p.id), ['user_001']);
});
