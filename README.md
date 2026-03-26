# idea-judge

Spawn 10 AI judge personas in parallel to evaluate competing ideas and pick the best one.

Each judge has a distinct expert lens — Developer, Skeptic, Growth Hacker, End User, Investor, Competitor Analyst, Product Designer, Marketer, Enterprise Buyer, Contrarian. They vote, then a synthesizer produces a final recommendation with confidence and risks.

## Install

```bash
pip install anthropic
```

## Usage

```bash
export ANTHROPIC_API_KEY=your_key_here

python judge.py "idea one | idea two | idea three" \
  --context "Your product/market context" \
  --judges 10
```

## Example

```bash
python judge.py \
  "Agent playground | CLI search tool | GitHub badge | Weekly digest" \
  --context "AI agent directory, 53 users/month, goal: drive adoption" \
  --judges 10
```

## Output

- Per-judge scores (1–10) for each idea with one-line verdict
- Each judge picks a winner from their perspective
- Synthesizer tallies votes → 🏆 Winner + confidence + risks + 🥈 runner-up

## Judges

| Persona | Focus |
|---------|-------|
| Developer | Technical feasibility, DX |
| Skeptic | Devil's advocate, false assumptions |
| Growth Hacker | Virality, CAC/LTV, distribution |
| End User | Simplicity, onboarding friction |
| Investor | Market size, defensibility |
| Competitor Analyst | Differentiation, moat |
| Product Designer | UX, delight, friction |
| Marketer | Hook, positioning, discovery |
| Enterprise Buyer | Security, reliability, TCO |
| Contrarian | Non-consensus bet |

Uses `claude-haiku-4-5` for judges (parallel), `claude-haiku-4-5` for synthesis.

## Requirements

- Python 3.8+
- `anthropic` Python package
- `ANTHROPIC_API_KEY` environment variable
