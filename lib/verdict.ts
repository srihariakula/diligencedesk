import { INTENT_LABELS } from "@/config/intents";
import type { Finding, VerdictResult } from "./types";

/**
 * Deterministic, explainable rules. No LLM: the same findings always give the same verdict,
 * and every verdict names the finding that caused it.
 *
 *   any sanctions hit                                  -> STOP
 *   company not found, document flagged, any finding
 *   unclear or unavailable, or any adverse filing      -> REVIEW
 *   otherwise                                          -> GO
 */
export function decideVerdict(findings: Finding[]): VerdictResult {
  const stop: string[] = [];
  const review: string[] = [];

  for (const f of findings) {
    const label = INTENT_LABELS[f.intent];
    if (f.intent === "SANCTIONS_SCREENING_MATCH" && f.status === "hit") {
      stop.push(`${label}: ${f.summary}`);
      continue;
    }
    if (f.status === "clear") continue;
    review.push(`${label}: ${describe(f)}`);
  }

  if (stop.length) return { verdict: "STOP", reasons: stop.concat(review) };
  if (review.length) return { verdict: "REVIEW", reasons: review };
  return { verdict: "GO", reasons: ["All checks clear."] };
}

function describe(f: Finding): string {
  switch (f.status) {
    case "unavailable":
      return "no provider answered; check manually";
    case "unclear":
      return `answer could not be interpreted (${f.summary})`;
    default:
      return f.summary;
  }
}
