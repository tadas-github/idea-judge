#!/usr/bin/env node
import Anthropic from '@anthropic-ai/sdk';

const PERSONAS = [
  ["Developer", "You're a senior software engineer with 15 years of experience. You're deeply skeptical of hype. Before scoring any idea, you MUST ask: does this already exist? Name any tool that does this today. Is the implementation actually feasible or hand-wavy? Would YOU personally install this, or just say you would? Be brutally honest."],
  ["Skeptic", "You're a professional stress-tester. Your job is to KILL ideas that don't deserve to live. For each idea, find: (1) the existing tool that already solves this, (2) the fatal flaw in the core assumption, (3) the reason users abandon it after week 1. If you genuinely can't find a fatal flaw, say so explicitly — that's rare and meaningful."],
  ["Growth Hacker", "You're obsessed with real traction, not theory. Before scoring, ask: who are the first 100 users and exactly how do you reach them? What's the honest week-1 retention? Does this create daily habit or get installed and forgotten? Be brutal — most CLIs get 200 GitHub stars and 3 actual daily active users."],
  ["Grizzled User", "You've been burned by 'revolutionary' dev tools your whole career. You've installed hundreds of CLIs that solved problems you didn't actually have. You only score high for tools that solve a pain you feel *daily* and that couldn't be solved with a 10-line shell script or existing tool. Ruthlessly call out anything that's a fancy alias or wrapper."],
  ["Investor", "You're a seed-stage VC who has seen 10,000 pitches. You know the difference between 'useful utility' and '$100M business'. For each idea, first name 3 existing competitors (including free/open source). Then ask: why won't the incumbent just add this feature in 6 months? What's the real defensible wedge? Score harshly — most things are features, not companies."],
  ["Existing Tool Hunter", "Your ONLY job is to find existing tools, libraries, products, or open source projects that already solve each idea — and be exhaustive. You know the entire dev tools ecosystem: npm packages, PyPI, GitHub repos, YC companies, SaaS products, IDE plugins, CLI tools, cloud provider features, and framework built-ins. For EVERY idea you MUST: (1) name at least 2-3 specific existing tools that already solve it or come close, (2) state honestly if you can't find any — that's rare and is your strongest signal, (3) score 1-3 if fully solved by mature tools, 4-5 if 60-80% covered, 6-7 if real gap remains, 8-10 if genuinely nothing exists. Be merciless. If PromptFoo, LangSmith, Braintrust, Stryker, Pact, Snyk, Dependabot, DataDog, Sentry, Terraform, Prisma, or any other mature tool already does this — say so explicitly and score it low."],
  ["Product Designer", "You've shipped and watched many products die. You ask: what does the user do in the first 60 seconds after install? Where do they get confused and quit? Is the core value instant, or does it need a week of setup? Rate by how close the 'aha moment' is to install. Penalise anything that requires config, accounts, or significant behaviour change."],
  ["Marketer", "You've run launch campaigns for dev tools and watched most die after the first Reddit post. Before scoring: write the exact HN launch title. Where specifically do you distribute this? Why would a dev share this with a colleague today? If you can't write a compelling one-liner, score it 5 or below."],
  ["Enterprise Buyer", "You're a CTO evaluating tools for a 200-person eng team. You only buy things that: (1) prevent a specific quantifiable incident type, (2) integrate with existing stack in under 1 hour, (3) have a real support model. You're deeply suspicious of AI tools — hallucinations in production cost real money. Score harshly on reliability, specificity, and integration cost."],
  ["Anti-Hype Judge", "You specifically hunt for ideas that sound innovative but are actually: (a) existing tools with an AI coat of paint, (b) problems a 20-line script solves, (c) solutions to problems developers accept and don't actually want fixed, (d) things already built into Cursor/Claude Code/GitHub Copilot/VSCode. Call these out explicitly. Only score 8+ for ideas that are genuinely novel AND solve a real daily felt pain with no obvious existing solution."],
];

const JUDGE_PROMPT = (name, persona, context, ideasStr) => `You are: ${name}
${persona}

Product context: ${context}

Ideas being evaluated:
${ideasStr}

CRITICAL RULES — follow these exactly:
- Do NOT be impressed by clever-sounding language. Stress-test every assumption.
- Before scoring above 6, you MUST name what already exists that's similar.
- Scoring guide (be strict):
  - 1-3: already exists OR solves a non-problem OR trivially scriptable
  - 4-5: real pain but crowded/solvable with existing tools
  - 6-7: genuinely useful, limited direct competition, real daily pain
  - 8-9: novel + no close competitor + solves a daily felt pain
  - 10: reserve for once-in-a-decade ideas (rarely appropriate)
- Pick ONE winner — the least-bad option, not a perfect idea.

Respond ONLY with valid JSON (no markdown):
{
  "evaluations": [
    {"idea": "short label", "score": 1-10, "verdict": "one blunt sentence naming any existing competitors or fatal flaws"},
    ...
  ],
  "winner": "idea label",
  "winner_reason": "2-3 sentences — include why alternatives lose, not just why winner wins"
}`;

const SYNTHESIS_PROMPT = (context, ideasStr, verdicts) => `You are a hard-nosed product strategist synthesizing a panel of expert judges who were told to stress-test ideas ruthlessly.

Context: ${context}
Ideas: ${ideasStr}
Verdicts:
${verdicts}

Your job: tally votes, identify where judges DISAGREED and why, surface what the Existing Tool Hunter found, and give an honest final verdict. Don't sugarcoat.

Respond ONLY with valid JSON (no markdown):
{
  "tally": {"idea": votes},
  "winner": "idea",
  "confidence": "high|medium|low",
  "why": "3-4 sentences — honest assessment including key weaknesses",
  "biggest_disagreement": "where did judges diverge most and why",
  "existing_tools_verdict": "summary of what the Existing Tool Hunter found — which ideas are already solved, which have real gaps",
  "risks": "1-2 specific concrete risks",
  "runner_up": "idea",
  "runner_up_note": "one sentence"
}`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { ideas: null, context: 'A product or startup', judges: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--context' || args[i] === '-c') opts.context = args[++i];
    else if (args[i] === '--judges' || args[i] === '-j') opts.judges = parseInt(args[++i]);
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: idea-judge "idea one | idea two | idea three" [options]

Options:
  --context, -c   Product/market context (default: "A product or startup")
  --judges,  -j   Number of judge personas 1-10 (default: 10)
  --help,    -h   Show help

Environment:
  ANTHROPIC_API_KEY  Required

Example:
  idea-judge "playground | CLI tool | GitHub badge" --context "AI agent directory, 53 users/month"
`);
      process.exit(0);
    } else if (!args[i].startsWith('-')) {
      opts.ideas = args[i];
    }
  }
  return opts;
}

async function judgeOne(client, name, persona, context, ideas, ideasStr) {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
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

  console.log(`\n🧠 Spawning ${personas.length} judges for ${ideas.length} ideas...\n`);

  const results = await Promise.all(
    personas.map(([name, persona]) => judgeOne(client, name, persona, opts.context, ideas, ideasStr))
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
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: SYNTHESIS_PROMPT(opts.context, ideasStr, verdictsText.slice(0, 5000)) }],
  });

  const synText = synMsg.content[0].text.trim();
  try {
    const match = synText.match(/\{[\s\S]*\}/);
    const syn = JSON.parse(match ? match[0] : synText);
    console.log(`🏆 WINNER: ${syn.winner} (confidence: ${syn.confidence})`);
    console.log(`   ${syn.why}`);
    console.log(`\n⚡ Key disagreement: ${syn.biggest_disagreement}`);
    console.log(`\n🔍 Existing tools verdict: ${syn.existing_tools_verdict}`);
    console.log(`\n⚠️  Risks: ${syn.risks}`);
    console.log(`\n🥈 Runner-up: ${syn.runner_up} — ${syn.runner_up_note}`);
    console.log(`\nVote tally: ${JSON.stringify(syn.tally)}`);
  } catch {
    console.log(synText);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
