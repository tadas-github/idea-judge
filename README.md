# idea-judge

Spawn 10 AI judge personas in parallel to evaluate competing ideas and pick the best one.

```bash
npx idea-judge "idea one | idea two | idea three" --context "your product context"
```

## Install

```bash
npm install -g idea-judge
# or just use npx (no install needed)
```

## Usage

```bash
export ANTHROPIC_API_KEY=your_key_here

npx idea-judge "playground | CLI tool | GitHub badge" \
  --context "AI agent directory, 53 users/month, goal: drive adoption" \
  --judges 10
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--context`, `-c` | Product/market context | "A product or startup" |
| `--judges`, `-j` | Number of judge personas (1–10) | 10 |
| `--help`, `-h` | Show help | |

## Output

- Per-judge scores (1–10) for each idea
- Each judge picks a winner from their perspective
- Final synthesis: 🏆 Winner + confidence + risks + 🥈 runner-up

## Judge personas

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

All 10 judges run in parallel. Requires `ANTHROPIC_API_KEY`.

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable

## License

MIT
