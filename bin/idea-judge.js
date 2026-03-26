#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';

const PERSONAS = [
  ["Developer",          "You're a senior software engineer. You care about technical feasibility, implementation complexity, and whether developers would actually use this."],
  ["Skeptic",            "You're a professional skeptic and devil's advocate. You poke holes, find edge cases, and challenge assumptions. Nothing gets past you."],
  ["Growth Hacker",      "You're obsessed with viral growth loops, acquisition channels, and retention. You think in CAC, LTV, and network effects."],
  ["End User",           "You're a typical user who just wants things to work. You care about simplicity, onboarding friction, and whether it solves a real pain."],
  ["Investor",           "You're a seed-stage VC. You think about market size, defensibility, timing, and whether this becomes a $100M business."],
  ["Competitor Analyst", "You know every competing product inside out. You evaluate differentiation, moat, and whether competitors could just copy this."],
  ["Product Designer",   "You obsess over UX, onboarding flows, and whether the experience delights. You spot friction immediately."],
  ["Marketer",           "You think in hooks, positioning, and distribution. You ask: how does this get discovered? What's the one-liner? Who shares it?"],
  ["Enterprise Buyer",   "You're a CTO at a mid-size company evaluating tools. You care about security, reliability, support, and total cost of ownership."],
  ["Contrarian",         "You believe the obvious answer is always wrong. You look for the non-consensus bet that everyone else is sleeping on."],
];

const JUDGE_PROMPT = (name, persona, context, ideasStr) => `You are: ${name}
${persona}

Product context: ${context}

Ideas being evaluated:
${ideasStr}

Score each idea 1-10 from your perspective and pick ONE winner.

Respond ONLY with valid JSON (no markdown):
{
  "evaluations": [
    {"idea": "short label", "score": 1-10, "verdict": "one sentence"},
    ...
  ],
  "winner": "idea label",
  "winner_reason": "2-3 sentences from your persona's POV"
}`;

const SYNTHESIS_PROMPT = (context, ideasStr, verdicts) => `You are a product strategist synthesizing 10 expert judges.

Context: ${context}
Ideas: ${ideasStr}
Verdicts:
${verdicts}

Respond ONLY with valid JSON (no markdown):
{
  "tally": {"idea": votes},
  "winner": "idea",
  "confidence": "high|medium|low",
  "why": "3-4 sentences",
  "risks": "1-2 key risks",
  "runner_up": "idea",
  "runner_up_note": "one sentence"
}`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    ideas: null,
    context: 'A product or startup',
    judges: 10,
    model: 'claude-haiku-4-5',
    synthModel: null, // defaults to model if not set
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' || args[i] === '-c') opts.context = args[++i];
    else if (args[i] === '--judges' || args[i] === '-j') opts.judges = parseInt(args[++i]);
    else if (args[i] === '--model' || args[i] === '-m') opts.model = args[++i];
    else if (args[i] === '--synth-model') opts.synthModel = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: idea-judge "idea one | idea two | idea three" [options]

Options:
  --context, -c    Product/market context (default: "A product or startup")
  --judges,  -j    Number of judge personas 1-10 (default: 10)
  --model,   -m    Model for judges (default: claude-haiku-4-5)
  --synth-model    Model for synthesis step (default: same as --model)
  --help,    -h    Show help

Environment:
  ANTHROPIC_API_KEY  Required

Examples:
  idea-judge "playground | CLI tool | badge" --context "AI directory, 53 users/month"
  idea-judge "idea A | idea B" --judges 5 --model claude-sonnet-4-5
  idea-judge "idea A | idea B" --model claude-haiku-4-5 --synth-model claude-sonnet-4-5
`);
      process.exit(0);
    } else if (!args[i].startsWith('-')) {
      opts.ideas = args[i];
    }
  }
  opts.synthModel = opts.synthModel || opts.model;
  return opts;
}

async function judgeOne(client, name, persona, context, ideas, ideasStr, model) {
  const msg = await client.messages.create({
    model,
    max_tokens: 800,
    messages: [{ role: 'user', content: JUDGE_PROMPT(name, persona, context, ideasStr) }],
  });
  const text = msg.content[0].text.trim();
  try {
    return [name, JSON.parse(text)];
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return [name, match ? JSON.parse(match[0]) : { winner: null, raw: text }];
  }
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.ideas) {
    console.error('Error: provide ideas as first argument, separated by |\nRun idea-judge --help for usage.');
    process.exit(1);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: key });
  const ideas = opts.ideas.split('|').map(s => s.trim()).filter(Boolean);
  const ideasStr = ideas.map(i => `- ${i}`).join('\n');
  const personas = PERSONAS.slice(0, Math.min(opts.judges, 10));

  console.log(`\n🧠 Spawning ${personas.length} judges for ${ideas.length} ideas...`);
  console.log(`   Judge model: ${opts.model} | Synth model: ${opts.synthModel}\n`);

  const results = await Promise.all(
    personas.map(([name, persona]) => judgeOne(client, name, persona, opts.context, ideas, ideasStr, opts.model))
  );

  console.log('='.repeat(60));
  const tally = {};
  let verdictsText = '';

  for (const [name, result] of results) {
    const winner = result.winner;
    if (winner) {
      tally[winner] = (tally[winner] || 0) + 1;
      verdictsText += `\n[${name}] Winner: ${winner} — ${result.winner_reason || ''}`;
    }
    console.log(`  ${name.padEnd(22)} → ${winner || '(error)'}`);
    for (const ev of result.evaluations || []) {
      console.log(`    ${String(ev.idea).padEnd(32)} ${String(ev.score).padStart(2)}/10  ${ev.verdict || ''}`);
    }
    console.log();
  }

  console.log('='.repeat(60));
  console.log('🔬 Synthesizing...\n');

  const synMsg = await client.messages.create({
    model: opts.synthModel,
    max_tokens: 1000,
    messages: [{ role: 'user', content: SYNTHESIS_PROMPT(opts.context, ideasStr, verdictsText.slice(0, 4000)) }],
  });

  const synText = synMsg.content[0].text.trim();
  try {
    const match = synText.match(/\{[\s\S]*\}/);
    const syn = JSON.parse(match ? match[0] : synText);
    console.log(`🏆 WINNER: ${syn.winner} (confidence: ${syn.confidence})`);
    console.log(`   ${syn.why}`);
    console.log(`\n⚠️  Risks: ${syn.risks}`);
    console.log(`\n🥈 Runner-up: ${syn.runner_up} — ${syn.runner_up_note}`);
    console.log(`\nVote tally: ${JSON.stringify(syn.tally)}`);
  } catch {
    console.log(synText);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
