# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/asjmak/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/asjmak/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the make.fun token-radar-01 bounty. From a sealed DefiLlama snapshot it ranks 198 tokenless protocols by implied token value: each protocol's TVL is multiplied by its category's median market-cap/TVL multiple among already-tokenised peers (winsorised and shrunk toward the global median), then adjusted for 7-day TVL momentum, protocol tenure, and multi-chain breadth. The entry writes a ranked board.json plus a judge dossier with an offline dashboard and screenshots; every watchlist protocol is covered, and each row carries a concrete farm plan for earning the future token.

## Run it

```sh
mkdir -p /input /output
cp snapshot.json /input/snapshot.json   # the sealed DefiLlama snapshot
node main.ts                             # writes /output/board.json and /output/dossier.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
