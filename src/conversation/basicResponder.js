'use strict';
// Basic Responder: a very small RULE-BASED conversation module.
//
// HONEST LIMITS: this is simple phrase matching using regular expressions.
// It does not understand language, reason, learn, or remember conversations.
// It is built to be REPLACED later by our own language understanding and
// response generation. The interface Core depends on is just two methods:
//
//   classify(text) -> an intent label such as 'greeting', or null if not recognised
//   respond(text, context, intent) -> { reply, exit? }
//
// context = { profile: <profile copy or null>, displayName: <string or null> }

const norm = (s) => String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

const RULES = [
  ['exit', /^(bye|goodbye|exit|quit|see you|see you later|good night)( eris)?$/],
  ['greeting', /^(hi|hello|hey|hiya|yo|greetings|good (morning|afternoon|evening))( there| eris)?$/],
  ['thanks', /^(thanks|thank you)( eris)?$/],
  ['how_are_you', /^how are you( doing| today)?$/],
  ['whoami', /\b(who am i|what'?s my name|what is my name|what do you call me|how do you (address|call) me|what do you know about me|what is my role|what'?s my role|am i the owner)\b/],
  ['name', /\b(what'?s|what is) your name\b|\bwho are you\b|\byour name\b/],
  ['capabilities', /\b(what can you do|what are you able to do|your capabilities|what do you do|what features|what are you capable of)\b/],
  ['help', /^(help|help me|i need help|can you help( me)?)$/],
  ['other_person', /^(who is|who's|tell me about|what do you know about)\s+(?!me\b)\S+/],
];

class BasicResponder {
  classify(text) {
    const t = norm(text);
    for (const [intent, re] of RULES) if (re.test(t)) return intent;
    return null;
  }

  respond(text, context = {}, intent = this.classify(text)) {
    const who = context.displayName;
    const p = context.profile;
    switch (intent) {
      case 'exit':
        return { reply: who ? `Goodbye, ${who}!` : 'Goodbye!', exit: true };
      case 'greeting':
        return { reply: who ? `Hello, ${who}! What would you like to talk about?` : 'Hello! What would you like to talk about?' };
      case 'thanks':
        return { reply: "You're welcome." };
      case 'how_are_you':
        return { reply: "I'm a small program, so I don't have feelings, but everything is running. How can I help?" };
      case 'name':
        return { reply: "I'm Eris, an AI assistant in early development. Right now I'm a simple rule-based program, not a trained model." };
      case 'capabilities':
        return {
          reply:
            "Right now I can chat using a small set of fixed phrases, get to know you through a short optional introduction, " +
            "keep basic local profiles (name, how you like to be addressed, aliases, optional gender), and report my component " +
            "status with /status. I match simple patterns rather than truly understanding language, and I have no AI model, " +
            "conversation memory, reasoning, or learning yet.",
        };
      case 'help':
        return { reply: 'You can talk to me in simple sentences, or type /help to see the commands.' };
      case 'whoami':
        if (!p) {
          return { reply: "I don't have a profile selected for you yet. If you'd like to introduce yourself, say something like \"I'm Sam\". It's optional." };
        }
        return {
          reply: `Your selected profile is ${who}, and its role is ${p.role}. That only means a profile was selected. I haven't verified who you are.`,
        };
      case 'other_person':
        return { reply: "I don't share information about other people's profiles, and I don't have general knowledge yet, so I can't answer that. You can ask \"who am I?\" about your own selected profile." };
      default:
        return { reply: "I'm sorry, I can't interpret that yet. I only recognise a small set of phrases right now. Try /help to see what I can do." };
    }
  }
}

module.exports = { BasicResponder };
