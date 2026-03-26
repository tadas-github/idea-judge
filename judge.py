#!/usr/bin/env python3
"""
idea-judge: Spawn N judge personas to evaluate ideas and pick the best one.
Usage: python3 judge.py "idea1 | idea2 | idea3" [--context "product context"] [--judges 10]
"""

import argparse
import asyncio
import json
import os
import sys
import anthropic

PERSONAS = [
    ("Developer", "You're a senior software engineer. You care about technical feasibility, implementation complexity, and whether developers would actually use this."),
    ("Skeptic", "You're a professional skeptic and devil's advocate. You poke holes, find edge cases, and challenge assumptions. Nothing gets past you."),
    ("Growth Hacker", "You're obsessed with viral growth loops, acquisition channels, and retention. You think in CAC, LTV, and network effects."),
    ("End User", "You're a typical user who just wants things to work. You care about simplicity, onboarding friction, and whether it solves a real pain."),
    ("Investor", "You're a seed-stage VC. You think about market size, defensibility, timing, and whether this becomes a $100M business."),
    ("Competitor Analyst", "You know every competing product inside out. You evaluate differentiation, moat, and whether competitors could just copy this."),
    ("Product Designer", "You obsess over UX, onboarding flows, and whether the experience delights. You spot friction immediately."),
    ("Marketer", "You think in hooks, positioning, and distribution. You ask: how does this get discovered? What's the one-liner? Who shares it?"),
    ("Enterprise Buyer", "You're a CTO at a mid-size company evaluating tools. You care about security, reliability, support, and total cost of ownership."),
    ("Contrarian", "You believe the obvious answer is always wrong. You look for the non-consensus bet that everyone else is sleeping on."),
]

JUDGE_PROMPT = """You are: {name}
{persona}

Product context: {context}

Here are the ideas being evaluated:
{ideas_list}

Evaluate each idea from your perspective. Be direct and specific. Then pick ONE winner and explain why it's the best bet from your point of view.

Respond in this exact JSON format:
{{
  "evaluations": [
    {{"idea": "idea name or short label", "score": 1-10, "verdict": "one sentence"}},
    ...
  ],
  "winner": "idea name",
  "winner_reason": "2-3 sentence explanation from your persona's POV"
}}"""

SYNTHESIS_PROMPT = """You are a product strategist synthesizing a panel of 10 expert judges.

Product context: {context}

Ideas: {ideas_list}

Judge verdicts:
{verdicts}

Your job: tally the winners, weigh the reasoning, and produce a final recommendation.

Respond in JSON:
{{
  "tally": {{"idea_name": vote_count, ...}},
  "winner": "idea name",
  "confidence": "high|medium|low",
  "why": "3-4 sentences on why this wins",
  "risks": "1-2 key risks to watch",
  "runner_up": "idea name",
  "runner_up_note": "one sentence"
}}"""


async def judge_one(client, persona_name, persona_desc, context, ideas_list, ideas_str):
    prompt = JUDGE_PROMPT.format(
        name=persona_name,
        persona=persona_desc,
        context=context,
        ideas_list=ideas_str,
    )
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
    )
    text = response.content[0].text.strip()
    try:
        # Extract JSON if wrapped in markdown
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return persona_name, json.loads(text)
    except Exception:
        return persona_name, {"raw": text, "winner": "parse error"}


async def run(ideas, context, num_judges):
    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    personas = PERSONAS[:num_judges]
    ideas_list = [i.strip() for i in ideas.split("|")]
    ideas_str = "\n".join(f"- {i}" for i in ideas_list)

    print(f"\n🧠 Spawning {len(personas)} judges for {len(ideas_list)} ideas...\n")

    tasks = [
        judge_one(client, name, desc, context, ideas_list, ideas_str)
        for name, desc in personas
    ]
    results = await asyncio.gather(*tasks)

    print("=" * 60)
    winner_tally = {}
    verdicts_text = ""
    for persona_name, result in results:
        if "winner" in result and result["winner"] != "parse error":
            w = result["winner"]
            winner_tally[w] = winner_tally.get(w, 0) + 1
            verdicts_text += f"\n[{persona_name}] Winner: {w} — {result.get('winner_reason','')}"
            print(f"  {persona_name:20s} → {w}")
            for ev in result.get("evaluations", []):
                print(f"    {ev.get('idea','?'):30s} {ev.get('score','?'):2}/10  {ev.get('verdict','')}")
        else:
            print(f"  {persona_name:20s} → (parse error)")
        print()

    # Synthesis
    print("=" * 60)
    print("🔬 Synthesizing...\n")
    synthesis_prompt = SYNTHESIS_PROMPT.format(
        context=context,
        ideas_list=ideas_str,
        verdicts=verdicts_text[:4000],  # truncate to stay within token limits
    )
    loop = asyncio.get_event_loop()
    syn_response = await loop.run_in_executor(
        None,
        lambda: client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1000,
            messages=[{"role": "user", "content": synthesis_prompt}],
        )
    )
    syn_text = syn_response.content[0].text.strip()
    try:
        if "```" in syn_text:
            syn_text = syn_text.split("```")[1]
            if syn_text.startswith("json"):
                syn_text = syn_text[4:]
        syn = json.loads(syn_text)

        print(f"🏆 WINNER: {syn.get('winner')} (confidence: {syn.get('confidence')})")
        print(f"   {syn.get('why')}")
        print(f"\n⚠️  Risks: {syn.get('risks')}")
        print(f"\n🥈 Runner-up: {syn.get('runner_up')} — {syn.get('runner_up_note')}")
        print(f"\nVote tally: {syn.get('tally')}")
    except Exception:
        print(syn_text)


def main():
    parser = argparse.ArgumentParser(description="Spawn judge agents to evaluate ideas")
    parser.add_argument("ideas", help='Ideas separated by | e.g. "idea one | idea two | idea three"')
    parser.add_argument("--context", default="A product or startup", help="Product/market context")
    parser.add_argument("--judges", type=int, default=10, help="Number of judge personas (max 10)")
    args = parser.parse_args()

    asyncio.run(run(args.ideas, args.context, min(args.judges, len(PERSONAS))))


if __name__ == "__main__":
    main()
