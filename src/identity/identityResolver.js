'use strict';
// Identity Resolution: connects a spoken name to candidate profile IDs.
// It only READS from ProfileMemory and never merges or creates anything.
//
// IMPORTANT: a "match" is only a candidate. A name is not proof of identity.

const normalize = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

class IdentityResolver {
  constructor(profileMemory) {
    this.profiles = profileMemory;
  }

  namesOf(profile) {
    return [profile.name, profile.preferredName, ...profile.aliases].filter(Boolean).map(normalize);
  }

  // true if this text is one of the profile's known names/aliases
  matches(profile, text) {
    return this.namesOf(profile).includes(normalize(text));
  }

  // status: 'none' | 'match' (exactly one candidate) | 'ambiguous' (several candidates)
  resolve(text) {
    const wanted = normalize(text);
    if (!wanted) return { status: 'none', candidates: [] };
    const candidates = this.profiles.listProfiles().filter((p) => this.namesOf(p).includes(wanted)).map((p) => p.id);
    if (candidates.length === 0) return { status: 'none', candidates };
    return { status: candidates.length === 1 ? 'match' : 'ambiguous', candidates };
  }
}

module.exports = { IdentityResolver, normalize };
