/**
 * Pricing table (USD per 1M tokens) for Codex / OpenAI models.
 *
 * IMPORTANT: these are public OpenAI list prices used only to *estimate*
 * cost on the dashboard. Codex via Azure deployments is actually billed
 * under the Azure OpenAI tier, which can differ — that is why every cost
 * shown in the Codex UI is labeled "estimated" and users can override via
 * the `claudeUsageTracker.codexPricing` setting.
 *
 * `cachedInput` follows OpenAI's prompt-caching discount: a request's
 * `cached_input_tokens` are a subset of `input_tokens` and get billed at a
 * reduced rate. We model this by subtracting cached tokens from fresh-input
 * tokens before pricing, then adding cachedInput * cached_input_tokens.
 *
 * Order matters: more specific substrings must come before generic ones.
 */
export interface CodexModelPricing {
  /** USD per 1M fresh (uncached) input tokens. */
  input: number;
  /** USD per 1M cached input tokens (typically ~10–50% of input). */
  cachedInput: number;
  /** USD per 1M output tokens (already includes reasoning tokens). */
  output: number;
}

const DEFAULT_TABLE: Array<[string, CodexModelPricing]> = [
  // GPT-5 family (forward estimate — real prices may differ; user can override)
  ['gpt-5.5-mini',   { input: 0.25,  cachedInput: 0.025, output: 2 }],
  ['gpt-5.5',        { input: 2.50,  cachedInput: 0.25,  output: 10 }],
  ['gpt-5-mini',     { input: 0.25,  cachedInput: 0.025, output: 2 }],
  ['gpt-5',          { input: 2.50,  cachedInput: 0.25,  output: 10 }],
  // GPT-4o family (published OpenAI prices)
  ['gpt-4o-mini',    { input: 0.15,  cachedInput: 0.075, output: 0.60 }],
  ['gpt-4o',         { input: 2.50,  cachedInput: 1.25,  output: 10 }],
  ['gpt-4-turbo',    { input: 10,    cachedInput: 5,     output: 30 }],
  ['gpt-4.1-mini',   { input: 0.40,  cachedInput: 0.10,  output: 1.60 }],
  ['gpt-4.1',        { input: 2,     cachedInput: 0.50,  output: 8 }],
  // Reasoning models (o1 / o3 family)
  ['o3-mini',        { input: 1.10,  cachedInput: 0.55,  output: 4.40 }],
  ['o3',             { input: 2,     cachedInput: 0.50,  output: 8 }],
  ['o1-mini',        { input: 3,     cachedInput: 1.50,  output: 12 }],
  ['o1-preview',     { input: 15,    cachedInput: 7.50,  output: 60 }],
  ['o1',             { input: 15,    cachedInput: 7.50,  output: 60 }],
  // Generic fallback prefix matches
  ['gpt-4',          { input: 2.50,  cachedInput: 1.25,  output: 10 }],
  ['gpt-3.5',        { input: 0.50,  cachedInput: 0.25,  output: 1.50 }],
];

const GENERIC_FALLBACK: CodexModelPricing = {
  input: 2.50, cachedInput: 1.25, output: 10,
};

export type CodexPricingOverrides = Record<string, Partial<CodexModelPricing>>;

export function priceCodex(
  model: string | undefined,
  overrides?: CodexPricingOverrides,
): CodexModelPricing {
  const m = (model || '').toLowerCase();
  if (!m) { return GENERIC_FALLBACK; }

  if (overrides) {
    for (const [key, partial] of Object.entries(overrides)) {
      if (m.includes(key.toLowerCase())) {
        const base = matchDefault(m) ?? GENERIC_FALLBACK;
        return { ...base, ...partial };
      }
    }
  }
  return matchDefault(m) ?? GENERIC_FALLBACK;
}

function matchDefault(modelLower: string): CodexModelPricing | null {
  for (const [key, p] of DEFAULT_TABLE) {
    if (modelLower.includes(key)) { return p; }
  }
  return null;
}

/**
 * Estimate USD cost for one Codex turn, given raw counts straight from a
 * `token_count` event. `inputTokens` is the full Codex value (which includes
 * `cachedInputTokens`); the function splits them out before pricing.
 */
export function estimateCodexCostUsd(
  model: string | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  overrides?: CodexPricingOverrides,
): number {
  const p = priceCodex(model, overrides);
  const freshInput = Math.max(0, inputTokens - cachedInputTokens);
  const cost =
    (freshInput * p.input) / 1_000_000 +
    (cachedInputTokens * p.cachedInput) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000;
  return Math.max(0, cost);
}
