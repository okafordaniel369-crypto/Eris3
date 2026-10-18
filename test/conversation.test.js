'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { BasicResponder } = require('../src/conversation/basicResponder');
const { tmpDir, newApp, say } = require('../testSupport/helpers');

const r = new BasicResponder();

test('greetings are recognised', () => {
  for (const g of ['Hi', 'hello', 'Hey!', 'Good morning']) assert.strictEqual(r.classify(g), 'greeting', g);
});

test('questions about Eris get an honest answer', () => {
  assert.match(r.respond('What is your name?').reply, /I'm Eris/);
  assert.match(r.respond('What is your name?').reply, /rule-based/);
});

test('capabilities answer states the limits and does not claim intelligence', () => {
  const reply = r.respond('What can you do?').reply;
  assert.match(reply, /simple patterns/);
  assert.match(reply, /no AI model/);
});

test('help request is recognised', () => {
  assert.strictEqual(r.classify('help'), 'help');
});

test('unrecognised text is reported as not understood', () => {
  assert.strictEqual(r.classify('explain quantum chromodynamics'), null);
  assert.match(r.respond('explain quantum chromodynamics').reply, /can't interpret that yet/);
});

test('"Who am I?" without a profile does not invent one', () => {
  const app = newApp(tmpDir());
  app.start();
  app.handleInput('who am i'); 
  assert.match(say(app, 'Who am I?'), /don't have a profile selected/);
});

test('"Who am I?" with a profile names it and says it is not verified', () => {
  const app = newApp(tmpDir());
  app.start();
  say(app, "I'm Shadow");
  say(app, 'Master Shadow');
  const reply = say(app, 'Who am I?');
  assert.match(reply, /Master Shadow/);
  assert.match(reply, /Owner/);
  assert.match(reply, /haven't verified/);
});

test('asking about another person gives no profile details', () => {
  const dir = tmpDir();
  const a = newApp(dir); a.start(); say(a, "I'm Shadow"); say(a, 'Master Shadow'); a.handleInput('/exit');
  const b = newApp(dir); b.start();
  say(b, "I'm Daniel"); // new person: no matching profile
  say(b, 'Daniel');
  const reply = say(b, 'Who is Shadow?');
  assert.doesNotMatch(reply, /Owner|user_001|Master/);
  assert.match(reply, /don't share information about other people/);
});

test('greeting uses the selected display name', () => {
  const app = newApp(tmpDir());
  app.start();
  say(app, "I'm Shadow"); say(app, 'Master Shadow');
  assert.match(say(app, 'Hi'), /Hello, Master Shadow!/);
});
