'use strict';
// Profile Memory: the ONLY place that creates or changes profiles.
// Core talks to this interface; it never touches the JSON file directly.
// It stores identity/profile facts only - NOT conversations.

const ROLES = { OWNER: 'Owner', USER: 'User' };

class ProfileError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProfileError';
    this.code = code; // CORRUPT | UNREADABLE | INVALID | OWNER_PROBLEM | UNAVAILABLE | NOT_FOUND | WRITE_FAILED
  }
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const sameText = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const isStrOrNull = (v) => v === null || typeof v === 'string';

function validateData(data) {
  const bad = (m) => new ProfileError('INVALID', `The profile data is not valid: ${m}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad('top level must be an object');
  if (data.version !== 1) throw bad('unsupported or missing "version"');
  if (!Array.isArray(data.profiles)) throw bad('"profiles" must be a list');
  if (data.ownerId !== null && typeof data.ownerId !== 'string') throw bad('"ownerId" must be text or null');

  const ids = new Set();
  for (const p of data.profiles) {
    if (!p || typeof p !== 'object') throw bad('a profile entry is not an object');
    if (typeof p.id !== 'string' || !p.id) throw bad('a profile has no id');
    if (ids.has(p.id)) throw bad(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (p.role !== ROLES.OWNER && p.role !== ROLES.USER) throw bad(`profile ${p.id} has an invalid role`);
    for (const f of ['name', 'preferredName', 'gender']) {
      if (!isStrOrNull(p[f])) throw bad(`profile ${p.id}: "${f}" must be text or null`);
    }
    if (!Array.isArray(p.aliases) || !p.aliases.every((a) => typeof a === 'string')) throw bad(`profile ${p.id}: "aliases" must be a list of text`);
    if (!p.preferences || typeof p.preferences !== 'object' || Array.isArray(p.preferences)) throw bad(`profile ${p.id}: "preferences" must be an object`);
    if (typeof p.createdAt !== 'string' || typeof p.updatedAt !== 'string') throw bad(`profile ${p.id}: missing timestamps`);
  }

  // Owner consistency. We NEVER repair this automatically.
  const owner = (m) => new ProfileError('OWNER_PROBLEM', `The owner information is inconsistent: ${m} I will not choose a new owner on my own.`);
  const owners = data.profiles.filter((p) => p.role === ROLES.OWNER);
  if (data.profiles.length === 0) {
    if (data.ownerId) throw owner('an owner is recorded but there are no profiles.');
    return;
  }
  if (!data.ownerId) throw owner('profiles exist but no owner is recorded.');
  if (!ids.has(data.ownerId)) throw owner('the recorded owner does not match any profile.');
  if (owners.length !== 1 || owners[0].id !== data.ownerId) throw owner('the owner roles do not match the recorded owner.');
}

class ProfileMemory {
  // store: any object with load() and save(data). clock: function returning an ISO time string.
  constructor(store, clock = () => new Date().toISOString()) {
    this.store = store;
    this.clock = clock;
    this.data = null;
    this.error = null;
  }

  // Loads and validates. Returns true if ready. On any problem, stays unavailable
  // and keeps the error so Core can report it. Nothing is written or repaired.
  init() {
    try {
      const data = this.store.load();
      validateData(data);
      this.data = data;
      this.error = null;
    } catch (err) {
      this.data = null;
      this.error = err instanceof ProfileError ? err : new ProfileError(err.code || 'INVALID', err.message);
    }
    return this.isReady();
  }

  isReady() { return this.data !== null; }
  getError() { return this.error; }

  _requireReady() {
    if (!this.isReady()) {
      throw new ProfileError('UNAVAILABLE', this.error ? this.error.message : 'Profile storage is not ready.');
    }
  }

  // Apply a change to a copy, save the copy, and only then adopt it.
  // If saving fails, the in-memory data is left unchanged.
  _commit(mutate) {
    this._requireReady();
    const next = clone(this.data);
    const result = mutate(next);
    try {
      this.store.save(next);
    } catch (err) {
      throw new ProfileError('WRITE_FAILED', err.message);
    }
    this.data = next;
    return result;
  }

  _nextId(data) {
    let max = 0;
    for (const p of data.profiles) {
      const m = /^user_(\d+)$/.exec(p.id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `user_${String(max + 1).padStart(3, '0')}`;
  }

  // Creates a profile. The role is decided HERE and cannot be requested by the caller:
  // Owner only if there are no profiles and no owner yet; User otherwise.
  createProfile(fields = {}) {
    const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const name = clean(fields.name);
    const preferredName = clean(fields.preferredName);
    const aliases = [];
    for (const a of [...(fields.aliases || []), name, preferredName]) {
      if (clean(a) && !aliases.some((x) => sameText(x, a))) aliases.push(a.trim());
    }
    const id = this._commit((data) => {
      const firstEver = data.profiles.length === 0 && !data.ownerId;
      const newId = this._nextId(data);
      const now = this.clock();
      data.profiles.push({
        id: newId,
        role: firstEver ? ROLES.OWNER : ROLES.USER,
        name,
        preferredName,
        aliases,
        gender: null,
        preferences: {},
        createdAt: now,
        updatedAt: now,
      });
      if (firstEver) data.ownerId = newId;
      return newId;
    });
    return this.getProfile(id);
  }

  _update(id, fn) {
    this._commit((data) => {
      const p = data.profiles.find((x) => x.id === id);
      if (!p) throw new ProfileError('NOT_FOUND', `No profile with id ${id}.`);
      fn(p);
      p.updatedAt = this.clock();
    });
    return this.getProfile(id);
  }

  setName(id, name) {
    return this._update(id, (p) => { p.name = name.trim(); addAliasTo(p, name); });
  }

  setPreferredName(id, preferred) {
    return this._update(id, (p) => {
      p.preferredName = preferred.trim();
      addAliasTo(p, preferred);
      delete p.preferences.addressStyle;
    });
  }

  clearPreferredName(id) {
    return this._update(id, (p) => { p.preferredName = null; });
  }

  addAlias(id, alias) {
    return this._update(id, (p) => addAliasTo(p, alias));
  }

  // Gender is only ever set when the user chose to provide it. Pass null to remove it.
  setGender(id, gender) {
    return this._update(id, (p) => { p.gender = gender ? String(gender).trim() : null; });
  }

  setPreference(id, key, value) {
    return this._update(id, (p) => { p.preferences[key] = value; });
  }

  getProfile(id) {
    this._requireReady();
    const p = this.data.profiles.find((x) => x.id === id);
    return p ? clone(p) : null;
  }

  listProfiles() {
    this._requireReady();
    return clone(this.data.profiles);
  }

  getOwner() {
    this._requireReady();
    return this.data.ownerId ? this.getProfile(this.data.ownerId) : null;
  }
}

function addAliasTo(p, alias) {
  const a = String(alias).trim();
  if (a && !p.aliases.some((x) => sameText(x, a))) p.aliases.push(a);
}

module.exports = { ProfileMemory, ProfileError, ROLES, validateData };
