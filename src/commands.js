'use strict';
// Slash commands. Handled separately from ordinary conversation.

const { getStatuses, formatStatus } = require('./dev/status');

const HELP = [
  'Commands:',
  '  /help     show this list',
  '  /status   show the real state of each component',
  '  /profile  show the currently selected profile',
  '  /test     run the automated tests and report the results',
  '  /exit     leave Eris',
  '',
  'Anything else is treated as conversation. Try "Hi", "What is your name?", "I\'m Sam", or "Don\'t call me Sam, call me Sammy".',
].join('\n');

function profileText(core) {
  if (!core.profiles.isReady()) return 'Profiles are unavailable because of the problem reported at start-up (see /status).';
  const p = core.currentProfile();
  if (!p) return 'No profile is selected for this session. Tell me your name (for example "I\'m Sam") to create or select one. That is optional.';
  return [
    'Selected profile (selected, NOT verified):',
    `  ID:              ${p.id}`,
    `  Name:            ${p.name || '(not provided)'}`,
    `  Preferred name:  ${p.preferredName || '(not set)'}`,
    `  Aliases:         ${p.aliases.length ? p.aliases.join(', ') : '(none)'}`,
    `  Role:            ${p.role}`,
    `  Gender:          ${p.gender ? 'provided (hidden until authentication exists)' : '(not provided)'}`,
    `  Preferences:     ${Object.keys(p.preferences).length} item(s)`,
    `  Created:         ${p.createdAt}`,
    `  Updated:         ${p.updatedAt}`,
    'Authentication is not installed, so this only shows which profile was selected.',
  ].join('\n');
}

function handleCommand(text, core) {
  const cmd = text.split(/\s+/)[0].toLowerCase();
  switch (cmd) {
    case '/help':
      return { reply: HELP, exit: false };
    case '/status':
      return { reply: formatStatus(getStatuses({ profiles: core.profiles, dataDir: core.dataDir })), exit: false };
    case '/profile':
      return { reply: profileText(core), exit: false };
    case '/test': {
      if (typeof core.runTests !== 'function') {
        return { reply: 'Tests are not available from inside Eris here. Run them from the terminal with: npm test', exit: false };
      }
      const r = core.runTests();
      const lines = [`Test run finished: ${r.pass} passed, ${r.fail} failed.`];
      for (const [name, v] of Object.entries(r.perFile)) lines.push(`  ${name.padEnd(14)} ${v.ok ? 'passed' : 'FAILED'} (${v.pass} passed, ${v.fail} failed)`);
      lines.push('Type /status to see the updated component states.');
      return { reply: lines.join('\n'), exit: false };
    }
    case '/exit': {
      const who = core.context().displayName;
      return { reply: who ? `Goodbye, ${who}!` : 'Goodbye!', exit: true };
    }
    default:
      return { reply: `I don't know the command ${cmd}. Type /help to see the commands.`, exit: false };
  }
}

module.exports = { handleCommand, HELP };
