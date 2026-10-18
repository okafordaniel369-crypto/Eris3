'use strict';
// Wires the parts together. Tests and the terminal both use createApp().

const path = require('path');
const { JsonStore } = require('./profiles/jsonStore');
const { ProfileMemory } = require('./profiles/profileMemory');
const { IdentityResolver } = require('./identity/identityResolver');
const { Introduction } = require('./conversation/introduction');
const { BasicResponder } = require('./conversation/basicResponder');
const { Core } = require('./core');
const { runAllTests } = require('./dev/testRunner');

// options.runTests: pass a function to replace the real test runner (used by tests).
function createApp({ dataDir, runTests, responder } = {}) {
  const dir = dataDir || path.join(__dirname, '..', 'data');
  const profiles = new ProfileMemory(new JsonStore(path.join(dir, 'profiles.json')));
  profiles.init();
  const identity = new IdentityResolver(profiles);
  const introduction = new Introduction({ profiles, identity });
  return new Core({
    profiles,
    identity,
    introduction,
    responder: responder || new BasicResponder(),
    dataDir: dir,
    runTests: runTests || (() => runAllTests({ dataDir: dir })),
  });
}

module.exports = { createApp };
