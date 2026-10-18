'use strict';
// Adaptive Introduction: learns a person's name and preferred form of address
// through normal conversation, one small question at a time.
//
// HONEST LIMITS: it is a small state machine plus pattern matching. It recognises
// only the phrases in parsers.js. It never forces an answer: after one clarification
// (or two ignored questions) it stops asking and the conversation carries on.
//
// handle() returns a reply string if it consumed the message, or null to let the
// normal responder answer instead.

const { ProfileError } = require('../profiles/profileMemory');
const P = require('./parsers');
const { normalize } = require('../identity/identityResolver');

const MAX_CLARIFICATIONS = 1; // ask once more after an unclear answer, then stop pressing
const MAX_IGNORED = 2;        // stop waiting for an answer after this many unrelated messages
const NOT = null;

class Introduction {
  constructor({ profiles, identity }) {
    this.profiles = profiles;
    this.identity = identity;
  }

  newSession() {
    return { profileId: null, stage: null, pending: null, clarifications: 0, ignored: 0, genderDeclined: false };
  }

  start(session) {
    session.stage = 'ask_name';
    return "Hello! I'm Eris. What should I call you?";
  }

  display(profile) {
    return profile.preferredName || profile.name || null;
  }

  handle(text, session, intent) {
    if (intent === 'exit') return NOT;
    try {
      let reply = this._byStage(text, session, intent);
      if (reply === NOT) reply = this._general(text, session);
      // Count messages that ignored an open question, and stop waiting after a couple.
      if (reply === NOT && intent === null && (session.stage === 'ask_name' || session.stage === 'ask_preferred')) {
        session.ignored += 1;
        if (session.ignored >= MAX_IGNORED) this._close(session);
      }
      return reply;
    } catch (err) {
      if (err instanceof ProfileError) return `I couldn't save that: ${err.message}`;
      throw err;
    }
  }

  _close(session) {
    session.stage = null;
    session.pending = null;
    session.clarifications = 0;
    session.ignored = 0;
  }

  _open(session, stage, pending = null) {
    session.stage = stage;
    session.pending = pending;
    session.clarifications = 0;
    session.ignored = 0;
  }

  // ---------- open questions ----------
  _byStage(text, session, intent) {
    switch (session.stage) {
      case 'ask_name': return this._askName(text, session, intent);
      case 'ask_preferred': return this._askPreferred(text, session, intent);
      case 'confirm_existing': return this._confirmExisting(text, session, intent);
      case 'choose_among': return this._chooseAmong(text, session, intent);
      case 'name_conflict': return this._nameConflict(text, session, intent);
      case 'confirm_gender': return this._confirmGender(text, session, intent);
      default: return NOT;
    }
  }

  _askName(text, session, intent) {
    if (intent) return NOT;
    if (P.isDecline(text)) {
      this._close(session);
      return "That's fine, you don't have to share a name. We can keep talking; I just won't have a profile saved for you. If you change your mind, say \"I'm <name>\".";
    }
    if (P.isUnclear(text)) {
      if (session.clarifications < MAX_CLARIFICATIONS) {
        session.clarifications += 1;
        return 'I can use your name, a nickname, or simply not use a name at all. What name would you prefer?';
      }
      this._close(session);
      return "No problem, I'll stop asking. We can keep chatting, and you can introduce yourself any time.";
    }
    const intro = P.parseIntroduction(text);
    if (intro) return this._nameGiven(intro.value, intro.kind, session);
    const bare = P.parseBareName(text);
    if (bare) return this._nameGiven(bare, 'name', session);
    return NOT;
  }

  _askPreferred(text, session, intent) {
    const p = this.profiles.getProfile(session.profileId);
    if (!p) { this._close(session); return NOT; }
    if (P.isSameAsName(text) && p.name) return this._setPreferred(p, p.name, session);
    if (intent) return NOT;
    if (P.isDecline(text)) {
      this.profiles.setPreference(p.id, 'addressStyle', 'neutral');
      this._close(session);
      return `No problem. I'll just use ${p.name || 'a neutral form of address'} and won't ask again. You can tell me any time.`;
    }
    if (P.isUnclear(text)) {
      if (session.clarifications < MAX_CLARIFICATIONS) {
        session.clarifications += 1;
        return 'I can use your name, a nickname, a title if you like, or your name alone. What would you prefer?';
      }
      this.profiles.setPreference(p.id, 'addressStyle', 'neutral');
      this._close(session);
      return "Okay, I'll keep it simple and stop asking. You can tell me how you'd like to be addressed any time.";
    }
    const correction = P.parseCorrection(text);
    const value = correction && correction.set ? correction.set : P.parseBareName(text);
    if (value) return this._setPreferred(p, value, session);
    return NOT;
  }

  _setPreferred(profile, value, session) {
    this.profiles.setPreferredName(profile.id, value);
    this._close(session);
    return `Certainly, ${value}!`;
  }

  _confirmExisting(text, session, intent) {
    const { value, kind, candidate } = session.pending;
    const yn = P.parseYesNo(text);
    if (yn === 'yes') {
      const profile = this.profiles.getProfile(candidate);
      return this._select(profile, session, 'Welcome back');
    }
    if (yn === 'no') {
      const created = this._createFor(value, kind, session);
      return `Understood, I won't treat you as that profile. ${created}`;
    }
    return this._unansweredChoice(session, intent, 'Please answer yes or no.');
  }

  _chooseAmong(text, session, intent) {
    const { value, kind, candidates } = session.pending;
    const t = P.fix(text).toLowerCase();
    const n = /^\d+$/.test(t) ? Number(t) : null;
    if (n && n >= 1 && n <= candidates.length) {
      return this._select(this.profiles.getProfile(candidates[n - 1]), session, 'Okay');
    }
    if (/^(new|none|neither|no|none of them|none of these)$/.test(t)) {
      return this._createFor(value, kind, session);
    }
    return this._unansweredChoice(session, intent, 'Please reply with one of the numbers, or say "new".');
  }

  _unansweredChoice(session, intent, nudge) {
    if (intent) return NOT; // they asked something else; answer it, keep the question open
    session.ignored += 1;
    if (session.ignored >= MAX_IGNORED) {
      this._close(session);
      return "Okay, let's skip that. We can carry on without a profile selected.";
    }
    return nudge;
  }

  _nameConflict(text, session, intent) {
    const { value, kind } = session.pending;
    const t = P.fix(text).toLowerCase();
    if (/(differen|new|someone else|another|not me)/.test(t)) {
      session.profileId = null;
      this._close(session);
      return this._nameGiven(value, kind, session);
    }
    if (/(chang|correct|update|same|it'?s me|me)/.test(t)) {
      const p = this.profiles.setName(session.profileId, value);
      this._close(session);
      return `Got it, I've updated your name to ${p.name}.`;
    }
    return this._unansweredChoice(session, intent, 'Please say "different person" or "change my name".');
  }

  _confirmGender(text, session, intent) {
    const yn = P.parseYesNo(text);
    if (yn === 'yes') {
      this.profiles.setGender(session.profileId, session.pending.gender);
      this._close(session);
      return 'Saved. You can remove it any time by saying "remove my gender".';
    }
    if (yn === 'no') {
      this._close(session);
      return "Okay, I won't save it.";
    }
    if (intent) return NOT;
    this._close(session);
    return "Okay, I won't save it.";
  }

  // ---------- statements that can happen any time ----------
  _general(text, session) {
    const t = P.fix(text);

    // Corrections to the selected profile
    const corr = P.parseCorrection(t);
    if (corr && session.profileId) return this._applyCorrection(corr, session);
    if (corr && !session.profileId) {
      // No profile yet: "just call me Shadow" works as an introduction; otherwise there is nothing to change.
      if (corr.set) return this._nameGiven(corr.set, 'call', session);
      return "I don't have a profile for you yet, so there's nothing to change. Tell me your name any time (for example \"I'm Sam\"); it's optional.";
    }

    // Optional gender: only when the person says it, and only saved after they agree.
    let m = t.match(/^(?:my gender is|i identify as)\s+(.+?)[.!]*$/i);
    if (m) {
      if (!session.profileId) return 'I don\'t have a profile for you yet. Tell me your name first (for example "I\'m Sam"). Sharing gender is always optional.';
      const gender = m[1].trim().slice(0, 40);
      this._open(session, 'confirm_gender', { gender });
      return `Would you like me to save "${gender}" to your profile? You can say no. (yes / no)`;
    }
    if (/^(remove|delete|clear|forget) my gender[.!]*$/i.test(t)) {
      if (!session.profileId) return "There's no selected profile, so nothing is saved.";
      this.profiles.setGender(session.profileId, null);
      return "Done. I've removed gender from your profile.";
    }
    if (/^i (?:don'?t|do not) (?:want to )?(?:share|give|say|tell) (?:you )?my gender/i.test(t)) {
      session.genderDeclined = true;
      return "Understood. I won't ask about it.";
    }

    // Introductions
    const intro = P.parseIntroduction(t);
    if (intro) return this._introduce(intro, session);
    return NOT;
  }

  _introduce(intro, session) {
    if (session.profileId) {
      const current = this.profiles.getProfile(session.profileId);
      if (this.identity.matches(current, intro.value)) {
        return `Right, I have you as ${this.display(current)}.`;
      }
      this._open(session, 'name_conflict', { value: intro.value, kind: intro.kind });
      return `You're currently using the profile for ${this.display(current)}. Is ${intro.value} a different person, or do you want to change the name on this profile? (say "different person" or "change my name")`;
    }
    return this._nameGiven(intro.value, intro.kind, session);
  }

  _applyCorrection(corr, session) {
    const id = session.profileId;
    const p = this.profiles.getProfile(id);
    if (corr.setName) this.profiles.setName(id, corr.setName);
    if (corr.remove && p.preferredName && normalize(p.preferredName) === normalize(corr.remove)) {
      this.profiles.clearPreferredName(id);
    }
    if (corr.set) {
      this.profiles.setPreferredName(id, corr.set);
      this._close(session);
      return `Of course, ${corr.set}.`;
    }
    if (corr.setName) return `Got it, I've updated your name to ${corr.setName}.`;
    this._open(session, 'ask_preferred');
    return `Understood, I won't call you ${corr.remove}. What would you like me to call you instead?`;
  }

  // ---------- creating / selecting profiles ----------
  _nameGiven(value, kind, session) {
    const res = this.identity.resolve(value);
    if (res.status === 'match') {
      this._open(session, 'confirm_existing', { value, kind, candidate: res.candidates[0] });
      return `I already have a profile that goes by "${value}". Is that you, continuing with it? (yes / no)\n(Just so you know, I can't verify who anyone really is yet. This only selects a profile.)`;
    }
    if (res.status === 'ambiguous') {
      this._open(session, 'choose_among', { value, kind, candidates: res.candidates });
      const list = res.candidates.map((id, i) => `  ${i + 1}) ${id}`).join('\n');
      return `I have more than one profile that goes by "${value}":\n${list}\nReply with a number, or say "new" if none of these is you.`;
    }
    return this._createFor(value, kind, session);
  }

  _createFor(value, kind, session) {
    const profile = this.profiles.createProfile(kind === 'call' ? { preferredName: value } : { name: value });
    session.profileId = profile.id;
    const note = profile.role === 'Owner'
      ? "\n(You're the first profile on this device, so it's marked as Owner. That's local bookkeeping only, not verified identity.)"
      : '';
    if (kind === 'call') {
      this._close(session);
      return `Certainly, ${value}! I've set up a local profile for you.${note}`;
    }
    this._open(session, 'ask_preferred');
    return `Nice to meet you, ${value}! I've created a local profile for you.${note}\nHow would you like me to address you? "${value}" is fine, or any other name or title, or no title at all.`;
  }

  _select(profile, session, opening) {
    session.profileId = profile.id;
    const who = this.display(profile) || 'there';
    const known = profile.preferredName || profile.preferences.addressStyle;
    const note = '(Selected by name only. I can\'t verify identity yet.)';
    if (!known && profile.name) {
      this._open(session, 'ask_preferred');
      return `${opening}, ${who}! ${note}\nHow would you like me to address you? "${profile.name}" is fine, or anything else you prefer.`;
    }
    this._close(session);
    return `${opening}, ${who}! ${note}`;
  }
}

module.exports = { Introduction };
