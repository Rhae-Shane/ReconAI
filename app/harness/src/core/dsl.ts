/**
 * dsl.ts — Reconciliation DSL parser.
 *
 * Parses `rule <id> { ... }` blocks into typed `RuleDefinition[]`. The grammar
 * (per SPEC §8) is:
 *
 *   rule <id> {
 *     source: <source-kind>
 *     match: [ field, field, ... ]        # FinRecord fields to match on
 *     net: {
 *       gross: [ item, ... ]              # FEE/refund source identifiers
 *       refund: [ item, ... ]
 *       adjustment: <signedNumber>
 *     }
 *     tolerance: { amount: <number>, date_days: <number> }
 *   }
 *
 * Unknown fields fail loudly — a typo or an unsupported key raises, rather than
 * silently drilling a hole in the deterministic-first chain. Pure.
 */

export interface RuleNet {
  /** Record ids (or refs) that form the gross/base of the settlement. */
  gross: string[];
  /** Record ids (or refs) of refund legs netted against gross. */
  refund: string[];
  /** Signed adjustment in paise (via `netExpected = gross − fee − refund + adj`). */
  adjustment: number;
}

export interface RuleTolerance {
  /** Allowed absolute money variance in paise. */
  amount: number;
  /** Allowed value-date skew in days. */
  date_days: number;
}

export interface RuleDefinition {
  id: string;
  /** Source kind this rule applies to (e.g. "razorpay-gateway"). */
  source: string;
  /** FinRecord fields (utr, gatewayRef, orderRef, ...) the rule matches on. */
  match: string[];
  net: RuleNet;
  tolerance: RuleTolerance;
}

const TOP_LEVEL_KEYS = new Set(['source', 'match', 'net', 'tolerance']);
const NET_KEYS = new Set(['gross', 'refund', 'adjustment']);
const TOLERANCE_KEYS = new Set(['amount', 'date_days']);

function fail(msg: string): never {
  throw new Error(`DSL parse error: ${msg}`);
}

/** Split `a,b,c` into trimmed string items; strips a surrounding `[ ... ]`. */
function splitList(raw: string): string[] {
  let s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  return s
    .split(',')
    .map((x) => x.trim().replace(/^["']|["']$/g, ''))
    .filter((x) => x.length > 0);
}

/** Parse a scalar value: `[ ... ]` -> string[], `{ ... }` -> raw object text. */
function parseValue(raw: string): string[] | string {
  const s = raw.trim();
  if (s.startsWith('[')) {
    const inner = s.slice(1, s.endsWith(']') ? -1 : undefined);
    return splitList(inner);
  }
  if (s.startsWith('{')) {
    const inner = s.slice(1, s.endsWith('}') ? -1 : undefined);
    return inner; // object text handled by the object parser
  }
  return s;
}

/** Parse a `{ gross: [...], refund: [...], adjustment: -10 }` body. */
function parseObjectBody(body: string, allowed: ReadonlySet<string>): Map<string, string> {
  const fields = new Map<string, string>();
  // Split on top-level commas, respecting brackets.
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!allowed.has(key)) {
      fail(`unknown field "${key}" (allowed: ${[...allowed].join(', ')})`);
    }
    fields.set(key, val);
  }
  return fields;
}

/** Parse one `rule <id> { ... }` block into a RuleDefinition. */
function parseBlock(block: string, id: string): RuleDefinition {
  const open = block.indexOf('{');
  const close = block.lastIndexOf('}');
  if (open < 0 || close <= open) fail(`rule "${id}" has no valid body`);
  const body = block.slice(open + 1, close);

  const def: RuleDefinition = {
    id,
    source: '',
    match: [],
    net: { gross: [], refund: [], adjustment: 0 },
    tolerance: { amount: 0, date_days: 0 },
  };

  const found = new Set<string>();
  // Split body into top-level `key: value` statements on newlines.
  const statements: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    if ((ch === '\n' || ch === ';') && depth === 0) {
      if (cur.trim()) statements.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) statements.push(cur);

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}') continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) fail(`rule "${id}": malformed statement "${trimmed}"`);
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (!TOP_LEVEL_KEYS.has(key)) {
      fail(`rule "${id}": unknown field "${key}" (allowed: source, match, net, tolerance)`);
    }
    found.add(key);
    if (key === 'source') {
      def.source = parseValue(value) as string;
    } else if (key === 'match') {
      def.match = parseValue(value) as string[];
    } else if (key === 'net') {
      const inner =
        parseValue(value) as string; // object text
      const obj = parseObjectBody(inner.replace(/^\{/, '').replace(/\}$/, ''), NET_KEYS);
      def.net = {
        gross: obj.has('gross') ? splitList(obj.get('gross')!) : [],
        refund: obj.has('refund') ? splitList(obj.get('refund')!) : [],
        adjustment: obj.has('adjustment') ? Number(obj.get('adjustment')) : 0,
      };
    } else if (key === 'tolerance') {
      const inner = parseValue(value) as string;
      const obj = parseObjectBody(inner.replace(/^\{/, '').replace(/\}$/, ''), TOLERANCE_KEYS);
      def.tolerance = {
        amount: obj.has('amount') ? Number(obj.get('amount')!) : 0,
        date_days: obj.has('date_days') ? Number(obj.get('date_days')!) : 0,
      };
    }
  }
  if (!def.source) fail(`rule "${id}": missing required field "source"`);
  return def;
}

/**
 * Extract `rule <id> { ... }` blocks from the DSL text using a balanced-brace
 * scan (so nested `net: { ... }` bodies don't truncate the block), then parse
 * each into a RuleDefinition.
 */
export function parseRules(text: string): RuleDefinition[] {
  const defs: RuleDefinition[] = [];
  const re = /rule\s+([A-Za-z0-9_-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    const start = m.index + m[0].length - 1; // index of the opening '{'
    let depth = 1;
    let i = start + 1;
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    if (depth !== 0) fail(`rule "${id}": unbalanced braces`);
    defs.push(parseBlock(text.slice(start, i), id));
  }
  return defs;
}

/** Convenience: `parseRules(readFile(file))` for the CLI/compiler entry points. */
export function parseRulesFile(spec: string): RuleDefinition[] {
  return parseRules(spec);
}
