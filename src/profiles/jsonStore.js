'use strict';
// JSON file storage. It only knows how to read and write one file.
// It knows nothing about profiles, owners, or aliases (that is ProfileMemory's job),
// so it can later be replaced by a database without touching Core.

const fs = require('fs');
const path = require('path');

class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StoreError';
    this.code = code; // 'CORRUPT' | 'UNREADABLE' | 'WRITE_FAILED'
  }
}

const EMPTY = () => ({ version: 1, ownerId: null, profiles: [] });

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  // Missing file = normal first launch -> empty data.
  // Existing but unreadable/malformed file -> StoreError. The file is never touched.
  load() {
    if (!fs.existsSync(this.filePath)) return EMPTY();
    let text;
    try {
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch (err) {
      throw new StoreError('UNREADABLE', `The profile file could not be read (${err.code || err.message}): ${this.filePath}`);
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new StoreError('CORRUPT', `The profile file is not valid JSON, so I left it untouched: ${this.filePath}`);
    }
  }

  // Writes to a temporary file first, then renames it, so a crash mid-write
  // cannot leave a half-written profile file.
  save(data) {
    const tmp = `${this.filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      throw new StoreError('WRITE_FAILED', `Could not save profiles (${err.code || err.message}).`);
    }
  }
}

module.exports = { JsonStore, StoreError };
