'use strict';
// Core: the small coordinator. It does not understand language and does not touch files.
// For each message it decides, in this order:
//   1. Is it a /command?                      -> commands.js
//   2. Is it part of the natural introduction? -> Introduction (may decline)
//   3. Otherwise                              -> the Responder (swappable later)
// Profiles are only ever read or changed through ProfileMemory.

const { handleCommand } = require('./commands');

class Core {
  constructor({ profiles, identity, introduction, responder, dataDir, runTests }) {
    this.profiles = profiles;
    this.identity = identity;
    this.introduction = introduction;
    this.responder = responder;
    this.dataDir = dataDir;
    this.runTests = runTests;
    this.session = introduction.newSession();
  }

  // Messages shown when Eris starts.
  start() {
    if (!this.profiles.isReady()) {
      return [
        `I couldn't load the profile data, so profile features are switched off.\nProblem: ${this.profiles.getError().message}\nI have not changed or replaced anything. See the README ("If something goes wrong"). You can still use /status, /help and /exit.`,
      ];
    }
    return [this.introduction.start(this.session)];
  }

  currentProfile() {
    if (!this.session.profileId || !this.profiles.isReady()) return null;
    return this.profiles.getProfile(this.session.profileId);
  }

  context() {
    const profile = this.currentProfile();
    return { profile, displayName: profile ? this.introduction.display(profile) : null };
  }

  // Returns { reply, exit }. Never throws for ordinary bad input.
  handleInput(raw) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!text) return { reply: null, exit: false };
    try {
      if (text.startsWith('/')) return handleCommand(text, this);

      const intent = this.responder.classify(text);
      if (this.profiles.isReady()) {
        const introReply = this.introduction.handle(text, this.session, intent);
        if (introReply !== null) return { reply: introReply, exit: false };
      }
      const out = this.responder.respond(text, this.context(), intent);
      return { reply: out.reply, exit: !!out.exit };
    } catch (err) {
      if (process.env.ERIS_DEBUG) console.error(err);
      return { reply: 'Sorry, something went wrong while handling that. Nothing was lost. Please try again.', exit: false };
    }
  }
}

module.exports = { Core };
