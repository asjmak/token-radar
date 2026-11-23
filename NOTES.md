# Token Radar entry — build notes

Entry source for make.fun **token-radar-01** ("Build the best token launch radar"), built from the
kit at `~/workspace/makefun/token-radar-kit/token-radar-01-kit`. Nothing here is registered,
bundled or submitted; this directory is the deliverable for the parent agent to assemble and enter.

## Layout

- `main.ts` — the program (Node 22, stdlib only). Reads `/input/snapshot.json` (or `--input`),
  writes `/output/board.json`, `/output/data.js`, copies `dashboard/` and `screenshots/` into
  `/output`, and writes `/output/dossier.json` last via the vendored library. Honours
  `MAKEFUN_OUTPUT_DIR` outside the grader's container.
- `lib/model.ts` — the model, the farm plans, snapshot parsing and the board self-check.
- `vendor/makefun-board.ts` — the kit's dossier library, copied byte for byte (sha256
  `9ca51b6e…`, matches kit.json); `LICENSE` is the starter's MIT license, likewise.
- `dashboard/` — `index.html` + `app.css` + `app.js`, 22,448 bytes in all, so the dossier's
  65,536-byte text shows every file whole (verified: dossier text 22,712 bytes, no cut marker).
- `screenshots/` — three real renders of this dashboard (see below).
- `.makefun/owner.json` — the claim file naming the account wallet.

## The model (`peer-comp-2`)

Implied value = TVL × peer ratio × momentum × tenure × breadth, all from the snapshot's fields:

- **Peer ratio.** Every tokenized protocol prices its category: ratio = mcap / TVL. A category's
  ratio is the median of its peers' ratios, each winsorized to [0.005, 5], then shrunk toward the
  global median (0.1689) in log space with a prior weight of 5 peers, so a 15-peer category speaks
  for itself and a 1-peer category is mostly the market average. No peers → global median.
- **Momentum** = 1 + clamp(change_7d, −40, +80)/100 × 0.6.
- **Tenure** = 0.85 + 0.30 × min(age_days, 1460)/1460; no listing date → 1.000 (range midpoint).
- **Breadth** = 1 + 0.02 × min(chains − 1, 5).

The board holds **198 rows**: all 40 watchlist protocols, plus 158 early candidates that pass the
watchlist's own structural screen (pre-token; not a Bridge/Canonical Bridge/Liquid Staking/Liquid
Restaking/Restaked BTC/CEX product; no versioned name; no whole word wrapped/staked/staking; no
exchange-name prefix) at any TVL. Tokenized protocols are never ranked; the dashboard shows the
top 24 by market cap apart, at the market's own values — they are also the peer evidence.

Top of the board: Steakhouse Financial $783.1M, Sentora Curator $753.9M, Gauntlet $470.0M,
USDD $177.8M, Nonce Capital $115.5M, Polymarket International $108.7M, Bittensor dTAO $85.5M,
RockawayX $77.5M, Veda $76.7M, BitFi Basis $70.1M.

**Farm plans** are generated per protocol from its own record: a playbook per category family
(lending, curator, trading, bridge, staking, prediction, vault, insurance, chain) supplies the
core/deepen/weekly actions; capital comes from a TVL tier ($50–$500), gas from the primary
chain's class, the hold from the protocol's age (30–60 days), a second-chain step when the
protocol has one, and a slug hash picks among setup phrasings so plans are not verbatim
boilerplate. Every step is one string carrying its action, its cost and its time (145–241 chars).

## The dashboard

Offline, no framework, no network references anywhere (the gate's scan passes). Board view:
header stats, the model stated in full with the per-category peer table, search + category +
chain + set filters, five sort orders, a two-slider model sandbox that recomputes implied values
live (and says so when its values differ from the filed board), the ranked table, and the
already-trading table. Detail view per protocol (hash route `#/p/<slug>`): stat grid, the row's
own derivation (ratio, peers, base, each multiplier, total), its farm plan, and a
nearby-on-the-board strip. Palette: deep navy, signal teal, amber; tabular numerals throughout.

## Screenshots

Real renders of `out/dashboard/index.html` in Chrome headless shell 157 (downloaded as
Chrome-for-Testing into `~/workspace/makefun/shot-tools/`; the puppeteer npm package drives it —
puppeteer's own browser installer failed in this VM, and `/opt/meta-chromium/chrome` refuses
non-hatch launches). All 1440×1440:

| file | view | bytes |
| --- | --- | --- |
| `1-board.png` | board, zoom 1, PNG | 310,158 |
| `2-detail.jpg` | Steakhouse Financial detail, zoom 1.15, JPEG q94 | 327,107 |
| `3-filtered.png` | Category = Lending, sort = TVL, zoom 1.15, PNG | 312,203 |

## Gate validation (local, all seven rows)

RULES.txt states there is **no local grade** for this competition ("the server grades every
entry"), and the kit ships no local scorer — so I implemented the seven gate rows of RULES.txt
verbatim in a validator (`/tmp/validate.mjs`, kept out of the entry) and ran it on a real
`/output` produced by `main.ts` against the kit's sealed input:

- dashboard_files — PASS (3 files, 22,448 bytes, no network address in any scanned position)
- board_file — PASS (198 rows, 330,590 bytes, all slugs from the snapshot, values in range)
- sorted_by_value — PASS (ranks exactly 1..198, implied non-increasing)
- coverage — PASS (all 40 watchlist slugs present)
- farm_steps — PASS (6–7 steps per row, 145–241 chars trimmed)
- screenshots — PASS (3 images, whole PNG/JPEG, 1440×1440, 310–327 KB each)
- dossier_matches — PASS (rebuilt with the vendored `buildDossier(output, {text_max_bytes:
  65536})`, byte-identical; dossier 1,289,791 bytes ≤ 1.5 MiB)

Determinism: two consecutive runs of `main.ts` produced byte-identical `board.json`, `data.js`,
`dossier.json`, dashboard files and screenshots copies (the program's two graded runs must
match; they do — no clocks, no randomness, stable tie-breaks everywhere).

## Blockers

None for the build. For the parent's submission step: the entry still needs the transcript
bundle and either a public GitHub repo (with README badges + About per `how_to_submit`) or a
source-bundle `init` + submit with the account keypair — deliberately not done here.
