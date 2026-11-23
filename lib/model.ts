// Peer-multiple radar model: one sealed snapshot in, one ranked board out.
//
// The question the board answers: if this protocol issued its token today, at the valuation the
// market already pays for comparable tokenized protocols, what would that token be worth?
//
//   peer ratio   Every protocol whose token already trades prices its category: ratio = mcap / TVL.
//                A category's ratio is the median of its peers' ratios, each winsorized to
//                [0.005, 5] so one mania or one corpse cannot carry a category, then shrunk
//                toward the global median (0.169 on this snapshot) with a prior weight of 5
//                peers: a category with 15 peers mostly speaks for itself, a category with 1
//                peer is mostly the market's average. No peers at all: the global median.
//   base         = TVL x peer ratio          (the value of the average comparable launch)
//   momentum     = 1 + clamp(change_7d, -40, +80) / 100 x 0.6
//                A protocol adding TVL is worth more than one bleeding it; the clamp keeps one
//                wild week from doubling or halving a launch value.
//   tenure       = 0.85 + 0.30 x min(age_days, 1460) / 1460
//                Four tokenless years at size is a track record, and the market pays for it;
//                a protocol listed last month has shown less. No listing date: 1.00, the
//                range's midpoint, neither credit nor penalty.
//   breadth      = 1 + 0.02 x min(chains - 1, 5)
//                TVL spread over several chains is harder to fake and easier to keep.
//   implied      = max(1, round(base x momentum x tenure x breadth))
//
// Nothing here names a protocol: the same functions score every row, and the dashboard states
// the constants and shows each row's arithmetic, so a reader can disagree with a number and
// see exactly where it came from.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  ratio_floor: number;
  ratio_cap: number;
  shrink_prior: number;
  momentum_weight: number;
  momentum_floor: number;
  momentum_cap: number;
  tenure_floor: number;
  tenure_range: number;
  tenure_days: number;
  chain_step: number;
  chain_max_extra: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.005,
  ratio_cap: 5,
  shrink_prior: 5,
  momentum_weight: 0.6,
  momentum_floor: -40,
  momentum_cap: 80,
  tenure_floor: 0.85,
  tenure_range: 0.3,
  tenure_days: 1460,
  chain_step: 0.02,
  chain_max_extra: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'peer-comp-2';

/** How many already-trading protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json: the ranked board's row, with the model's arithmetic kept on it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  model: {
    peer_category: string;
    peer_count: number;
    category_ratio: number;
    base_usd: number;
    momentum_multiplier: number;
    tenure_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row: the board row's fields, plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  ratio: number;
  peers: number;
  base_usd: number;
  momentum: number;
  tenure: number;
  breadth: number;
  farm_steps: string[];
}

/** A category's peer evidence: how many tokenized peers priced it, and the ratio they imply. */
export interface CategoryRatio {
  category: string;
  peers: number;
  raw_median: number;
  ratio: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the peer table, the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  scanned: number;
  tokenized: number;
  pre_token: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_ratio: number;
  categories: CategoryRatio[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

// The watchlist's own structural screen, applied below the floor: a board row must be a protocol
// in its own right, not a wrapped, staked or bridged product of a token that already trades, not
// an exchange's house product, and not one versioned pool of another protocol.
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const PRODUCT_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a pre-token protocol is a launch candidate in its own right (the early board's screen). */
export function isLaunchCandidate(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_NAME.test(p.name)) return false;
  return true;
}

/** The peer evidence: every category's shrunk mcap/TVL ratio, from the protocols that already trade. */
export function peerRatios(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; byCategory: Map<string, CategoryRatio> } {
  const winsor = (r: number): number => clamp(r, model.ratio_floor, model.ratio_cap);
  const tokenized = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(tokenized.map((p) => winsor(p.mcap_usd! / p.tvl_usd)));
  const groups = new Map<string, number[]>();
  for (const p of tokenized) {
    const key = p.category ?? '(none)';
    const list = groups.get(key) ?? [];
    list.push(winsor(p.mcap_usd! / p.tvl_usd));
    groups.set(key, list);
  }
  const byCategory = new Map<string, CategoryRatio>();
  for (const [category, ratios] of groups) {
    const raw = median(ratios);
    const n = ratios.length;
    // Geometric shrinkage: ratios multiply value, so the blend is taken in log space.
    const ratio = Math.exp((n * Math.log(raw) + model.shrink_prior * Math.log(global)) / (n + model.shrink_prior));
    byCategory.set(category, { category, peers: n, raw_median: round4(raw), ratio: round4(ratio) });
  }
  return { global: round4(global), byCategory };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  peers: { global: number; byCategory: Map<string, CategoryRatio> },
  model: ModelConstants = MODEL,
): { implied: number; base: number; ratio: number; peerCount: number; momentumMult: number; tenureMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const entry = peers.byCategory.get(protocol.category ?? '(none)');
  const ratio = entry?.ratio ?? peers.global;
  const peerCount = entry?.peers ?? 0;
  const base = protocol.tvl_usd * ratio;
  const growth = clamp(finite(protocol.change_7d, 0), model.momentum_floor, model.momentum_cap);
  const momentumMult = 1 + (growth / 100) * model.momentum_weight;
  const tenureMult = age === null
    ? model.tenure_floor + model.tenure_range / 2
    : model.tenure_floor + (Math.min(age, model.tenure_days) / model.tenure_days) * model.tenure_range;
  const breadthMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max_extra);
  const implied = Math.max(1, Math.round(base * momentumMult * tenureMult * breadthMult));
  return { implied, base: Math.round(base), ratio, peerCount, momentumMult, tenureMult, breadthMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const peers = peerRatios(snapshot, model);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it is ranked, whatever the screen says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early board: every other launch candidate the screen passes, at any TVL. The radar
  // exists to find these before they are obvious, so the set is not capped by size.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isLaunchCandidate(p)) chosen.set(p.slug, p);
  }
  const watchlist = new Set(snapshot.watchlist);
  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, peers, model) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'pre-token' as const,
    watchlist: watchlist.has(s.p.slug),
    implied_value_usd: s.implied,
    model: {
      peer_category: s.p.category ?? '(none)',
      peer_count: s.peerCount,
      category_ratio: round4(s.ratio),
      base_usd: s.base,
      momentum_multiplier: round4(s.momentumMult),
      tenure_multiplier: round4(s.tenureMult),
      breadth_multiplier: round4(s.breadthMult),
    },
    farm_steps: farmPlan(s.p, s.age),
  }));
}

// ---------------------------------------------------------------- farm plans
//
// A plan is six steps: set up, take the position, deepen it, keep it qualifying, hold it, and
// check for the claim. The words come from the protocol's own record — its category's action,
// its first chain, a capital tier from its TVL, a hold from its age — and a hash of its slug
// picks among phrasings, so no two plans read as the same boilerplate and no name is hand-written.

/** A small stable hash of a slug, for choosing phrasings deterministically. */
function slugHash(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = (slug: string, salt: number, options: string[]): string => options[(slugHash(slug) + salt) % options.length]!;

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 50;
}

/** The gas a first transaction costs on a chain, in round dollars. */
function gasFor(chain: string): string {
  if (chain === 'Ethereum') return 'about $8 of gas on Ethereum mainnet';
  if (chain === 'Bitcoin') return 'about $4 of network fees on Bitcoin';
  if (chain === 'Solana' || chain === 'Algorand' || chain === 'Stellar') return 'under $1 of network fees';
  if (chain === 'Tron') return 'about $2 of network fees';
  return 'about $2 of gas';
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category family's key: the playbooks below are written per family, not per protocol. */
function familyOf(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) return 'curator';
  if (c.includes('dex') || c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic')) return 'trading';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) return 'staking';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('rwa') || c.includes('stable') || c.includes('basis') || c.includes('algo')) return 'vault';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('chain') || c.includes('payments') || c.includes('card')) return 'chain';
  return 'vault';
}

/** The family's core action and weekly qualifying action, in words a farmer can follow. */
const PLAYBOOK: Record<string, { core: (n: string, ch: string, cap: number) => string; deepen: (n: string, ch: string, cap: number) => string; weekly: (n: string, ch: string) => string }> = {
  lending: {
    core: (n, ch, cap) => `Supply $${cap} of USDC to ${n} on ${ch} as collateral and leave the position open.`,
    deepen: (n, ch, cap) => `Borrow about $${Math.round(cap / 3)} of a stablecoin against the collateral on ${n} and re-supply it once, keeping the health factor above 2.`,
    weekly: (n, ch) => `Repay and re-borrow a small amount, or top the collateral up, so ${n} records an active loan every week.`,
  },
  curator: {
    core: (n, ch, cap) => `Deposit $${cap} of USDC into a ${n} vault on ${ch} and hold the vault shares in the same wallet.`,
    deepen: (n, ch, cap) => `Split a second $${Math.round(cap / 2)} into another ${n} vault on ${ch} so the position counts in more than one market.`,
    weekly: (n, ch) => `Claim any vault rewards on ${n} and re-deposit them, so the position compounds and stays active.`,
  },
  trading: {
    core: (n, ch, cap) => `Deposit $${cap} of USDC on ${n} on ${ch} and provide it to the main pool or margin account.`,
    deepen: (n, ch, cap) => `Trade about $${cap * 2} of volume across the week on ${n}, in small hedged orders rather than one wash trade.`,
    weekly: (n, ch) => `Place at least two real trades a week on ${n} and keep the margin balance above half the deposit.`,
  },
  bridge: {
    core: (n, ch, cap) => `Bridge $${cap} of USDC to ${ch} through ${n} and use the bridged funds in an app on the far side.`,
    deepen: (n, ch, cap) => `Bridge a second $${Math.round(cap / 2)} back a week later, so ${n} records flow in both directions.`,
    weekly: (n, ch) => `Make one small bridge a week through ${n} and keep some bridged balance parked on the far chain.`,
  },
  staking: {
    core: (n, ch, cap) => `Stake $${cap} worth of the chain's staking asset through ${n} on ${ch} and keep the receipt token.`,
    deepen: (n, ch, cap) => `Put the receipt token to work in a $${Math.round(cap / 2)} position the protocol itself links to, if it offers one.`,
    weekly: (n, ch) => `Claim staking rewards on ${n} weekly and restake them, so the balance and the activity both grow.`,
  },
  prediction: {
    core: (n, ch, cap) => `Fund $${cap} on ${n} and take a position in one of its liquid markets on ${ch}.`,
    deepen: (n, ch, cap) => `Hold positions in at least three different markets on ${n}, about $${Math.round(cap / 3)} each, rather than one bet.`,
    weekly: (n, ch) => `Trade at least twice a week on ${n} and settle every finished market instead of letting positions lapse.`,
  },
  vault: {
    core: (n, ch, cap) => `Deposit $${cap} of USDC into ${n}'s main vault on ${ch} and hold the shares.`,
    deepen: (n, ch, cap) => `Add a second $${Math.round(cap / 2)} after two weeks, so ${n} sees a returning depositor rather than one visit.`,
    weekly: (n, ch) => `Check the vault weekly and claim or compound any yield ${n} pays, leaving the principal untouched.`,
  },
  insurance: {
    core: (n, ch, cap) => `Buy $${cap} of cover from ${n} on ${ch} for a position you actually hold elsewhere.`,
    deepen: (n, ch, cap) => `Stake $${Math.round(cap / 2)} into ${n}'s underwriting pool if it has one, and keep the stake locked for the term.`,
    weekly: (n, ch) => `Renew or extend one policy a week on ${n} so the cover never lapses between snapshots.`,
  },
  chain: {
    core: (n, ch, cap) => `Move $${cap} of funds onto ${ch} and make ${n} the wallet's home: hold the balance there, not on an exchange.`,
    deepen: (n, ch, cap) => `Use two native apps on ${ch} with the same wallet, about $${Math.round(cap / 2)} in each, so the activity is not one contract.`,
    weekly: (n, ch) => `Make one transaction a week on ${ch} (a transfer, a swap or a stake) so the wallet stays an active address.`,
  },
};

/**
 * A protocol's farm plan: six steps, each one string carrying its action, its cost and its time,
 * derived from the protocol's own record. Every string lands inside the gate's 20..600 characters.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const book = PLAYBOOK[familyOf(p)]!;
  const gas = gasFor(chain);
  const steps = [
    `${pick(p.slug, 1, [
      `Fund a fresh wallet with the capital for this farm and keep its seed phrase offline, on paper.`,
      `Use one wallet only for this farm, funded just before you start, and keep its seed phrase offline.`,
      `Set up a dedicated wallet for ${p.name} so the farm's activity is clean and countable.`,
    ])} Cost: ${gas} for the first transaction. Time: 10 minutes.`,
    `${book.core(p.name, chain, capital)} Cost: $${capital} of capital plus ${gas}. Time: 15 minutes to set up.`,
    `${book.deepen(p.name, chain, capital)} Cost: the extra capital named, plus about $2 of gas. Time: 10 minutes.`,
    `${book.weekly(p.name, chain)} Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    ...(second !== null
      ? [`Repeat the core position on ${second}, ${p.name}'s second chain, with about $${Math.round(capital / 2)}: multi-chain activity is the cheapest signal a wallet can add. Cost: $${Math.round(capital / 2)} plus ${gasFor(second)}. Time: 15 minutes.`]
      : []),
    `Hold every position for at least ${hold} days, so the activity stands in more than one weekly snapshot of ${p.name}. Cost: the capital stays deployed and cannot be spent meanwhile. Time: ${hold} days.`,
    `Each week, open ${p.name}'s own points or rewards page from the app itself and screenshot your balance; claim only from a link the app publishes, and never pay a fee to claim. Cost: nothing to check. Time: 5 minutes a week.`,
  ];
  return steps.slice(0, 7).map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      symbol: p.symbol,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    ratio: row.model.category_ratio,
    peers: row.model.peer_count,
    base_usd: row.model.base_usd,
    momentum: row.model.momentum_multiplier,
    tenure: row.model.tenure_multiplier,
    breadth: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerRatios(snapshot, model);
  const categories = [...peers.byCategory.values()].sort((a, b) => b.peers - a.peers || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    scanned: snapshot.protocols.length,
    tokenized: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    pre_token: snapshot.protocols.filter((p) => isPreToken(p)).length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !r.watchlist).length,
    live_size: live.length,
    global_ratio: peers.global,
    categories,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, values, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears twice on the board';
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
