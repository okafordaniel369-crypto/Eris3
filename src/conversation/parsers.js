'use strict';
// Small text helpers. These are simple pattern matchers (regular expressions),
// NOT language understanding. They only recognise the phrases listed here.

const fix = (s) => String(s || '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();

// Words that mean "this is not a name".
const NOT_NAME = new Set([
  'fine', 'good', 'great', 'ok', 'okay', 'well', 'tired', 'happy', 'sad', 'here', 'back', 'new', 'ready',
  'sorry', 'not', 'just', 'sure', 'confused', 'lost', 'bored', 'hungry', 'curious', 'testing', 'later',
  'tomorrow', 'now', 'maybe', 'a', 'an', 'the', 'so', 'very', 'really', 'also', 'still', 'going', 'trying',
  'looking', 'wondering', 'asking', 'male', 'female', 'man', 'woman', 'boy', 'girl', 'nonbinary', 'non-binary',
  'what', 'how', 'why', 'who', 'when', 'where', 'can', 'could', 'do', 'does', 'did', 'tell', 'show', 'help',
  'thanks', 'thank', 'yes', 'no', 'yeah', 'yep', 'nope', 'nah', 'skip', 'hi', 'hello', 'hey', 'bye', 'you',
  'your', 'me', 'my', 'is', 'are', 'am', 'will', 'would', 'should', 'please', 'i', "i'm", 'im',
]);

function titleCaseIfLower(v) {
  return v === v.toLowerCase() ? v.replace(/(^|[\s\-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : v;
}

// Returns a tidy name (1-3 words, letters only) or null.
function cleanName(raw) {
  if (!raw) return null;
  let v = fix(raw).replace(/[.!?,;:]+$/, '').replace(/^["']+|["']+$/g, '').trim();
  if (!v || v.length > 40) return null;
  if (!/^\p{L}[\p{L}\p{M}'.\- ]*$/u.test(v)) return null;
  const words = v.split(/\s+/);
  if (words.length > 3) return null;
  if (words.some((w) => NOT_NAME.has(w.toLowerCase().replace(/\.$/, '')))) return null;
  return titleCaseIfLower(v);
}

const CALL_ME = /^(?:(?:you can|please|just|instead|also|actually)\s+)*call me\s+(.+)$/i;

// "I'm Shadow", "My name is Daniel", "You can call me Master Shadow"
// -> { kind: 'name' | 'call', value }   or null
function parseIntroduction(text) {
  const t = fix(text).replace(/^(?:hi|hello|hey|greetings)\b[\s,!.:-]*/i, '');
  let m = t.match(CALL_ME);
  if (m) { const v = cleanName(m[1]); return v ? { kind: 'call', value: v } : null; }
  m = t.match(/^(?:i'?m|i am|my name is|my name's|name's|this is)\s+(.+)$/i);
  if (m) { const v = cleanName(m[1]); return v ? { kind: 'name', value: v } : null; }
  return null;
}

// Corrections to an existing profile:
//  "Don't call me Master Shadow anymore. Just call me Shadow."
//  "I prefer Sir Daniel"   "Change my name to Dan"
// -> { remove, set, setName }  (each may be null)  or null if nothing recognised
function parseCorrection(text) {
  const out = { remove: null, set: null, setName: null };
  const sentences = fix(text).split(/[.!;]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    let m = s.match(/^(?:please\s+)?(?:don'?t|do not|stop)\s+(?:calling|call)\s+me\s+(.+?)(?:\s+any ?more)?$/i);
    if (m) { out.remove = cleanName(m[1]); continue; }
    m = s.match(CALL_ME);
    if (m) { out.set = cleanName(m[1]) || out.set; continue; }
    m = s.match(/^(?:i\s+(?:prefer|want to be called)|i'?d (?:rather|like to) be called|i'?d prefer)\s+(.+)$/i);
    if (m) { out.set = cleanName(m[1]) || out.set; continue; }
    m = s.match(/^(?:please\s+)?(?:change|correct|update) my name to\s+(.+)$/i);
    if (m) { out.setName = cleanName(m[1]) || out.setName; continue; }
  }
  return out.remove || out.set || out.setName ? out : null;
}

function parseYesNo(text) {
  const t = fix(text).toLowerCase().replace(/[.!?]+$/, '');
  if (/^(yes|yeah|yep|yup|sure|correct|right|that'?s me|it is|ok|okay|please do|y)$/.test(t)) return 'yes';
  if (/^(no|nope|nah|not me|that'?s not me|wrong|n|no thanks|don'?t)$/.test(t)) return 'no';
  return null;
}

const isUnclear = (text) =>
  /^(whatever|anything|any ?thing|don'?t care|do not care|doesn'?t matter|does not matter|idk|i don'?t know|dunno|not sure|you (choose|decide|pick)|up to you|as you like|either|surprise me|no idea)\b/i.test(fix(text));

const isDecline = (text) =>
  /\b(rather not|prefer not|no thanks|not telling|none of your business|skip|no preference)\b|^(no|nope|nah)\b[.!]*$|don'?t want to (say|share|tell|give)/i.test(fix(text));

// A reply made only of a name, e.g. "Shadow" or "Master Shadow". Strips lead-ins like "Just", "It's".
function parseBareName(text) {
  const t = fix(text).replace(/^(?:just|simply|it'?s|its|i prefer|i'?d prefer|i like|please)\s+/i, '');
  if (/\?/.test(t)) return null;
  const name = cleanName(t);
  // A bare reply is only treated as a name if it is short (1-2 words); longer text is more likely a sentence.
  return name && name.split(/\s+/).length <= 2 ? name : null;
}

const isSameAsName = (text) =>
  /\b(no title|just my name|my name( is)? fine|name only|the same|same as my name|no title please)\b|^same$/i.test(fix(text));

module.exports = {
  fix, cleanName, parseIntroduction, parseCorrection, parseYesNo, isUnclear, isDecline, parseBareName, isSameAsName,
};
