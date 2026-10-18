#!/usr/bin/env node
'use strict';
// Entry point: node src/index.js   (or: npm start)

const readline = require('readline');
const path = require('path');
const { createApp } = require('./app');

const dataDir = process.env.ERIS_DATA_DIR || path.join(__dirname, '..', 'data');

let app;
try {
  app = createApp({ dataDir });
} catch (err) {
  console.error(`Eris could not start: ${err.message}`);
  process.exit(1);
}

const say = (text) => { if (text) console.log(`\nEris: ${text}\n`); };

console.log('ERIS 3.0 - Milestone 1. Type /help for commands, /exit to leave.');
app.start().forEach(say);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'You: ' });
rl.prompt();

rl.on('line', (line) => {
  let result;
  try {
    result = app.handleInput(line);
  } catch (err) {
    if (process.env.ERIS_DEBUG) console.error(err);
    result = { reply: 'Sorry, something went wrong. Please try again.', exit: false };
  }
  say(result.reply);
  if (result.exit) { rl.close(); return; }
  rl.prompt();
});

rl.on('close', () => process.exit(0));
