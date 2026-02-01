export type PatientVoiceOptions = {
  /** Allow generalizing pronouns like "man" / "en". Default: false. */
  allowGeneralPronouns?: boolean;
  /** Allow "vi"-language. Default: false. */
  allowWe?: boolean;
};

export type PatientSpeechCalibrationOptions = PatientVoiceOptions & {
  /** Optional phase for stricter early-session language. */
  phase?: "early" | "mid" | "late";
  /** Maximum number of sentences to keep. Defaults vary by phase. */
  maxSentences?: number;
  /** Maximum characters to keep. Defaults vary by phase. */
  maxChars?: number;
};

const WE_WORDS = /\b(vi|oss|vår|vårt|våre)\b/i;
const MAN_WORD = /\bman\b/i;

// "en" is ambiguous in Norwegian (number vs pronoun). We only flag likely pronoun uses.
const EN_PRONOUN_LIKELY = /\ben\s+(?:blir|kan|må|skal|gjør|kjenner|tenker|får|har|er)\b/i;

export function violatesPatientVoice(text: string, opts: PatientVoiceOptions = {}): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;

  if (!opts.allowWe && WE_WORDS.test(t)) return true;
  if (!opts.allowGeneralPronouns && MAN_WORD.test(t)) return true;
  if (!opts.allowGeneralPronouns && EN_PRONOUN_LIKELY.test(t)) return true;

  return false;
}

export function sanitizePatientSpeech(text: string, opts: PatientVoiceOptions = {}): string {
  let t = (text ?? "").trim();
  if (!t) return "";

  if (!opts.allowWe) {
    t = t.replace(/\bvi\b/gi, "jeg");
    t = t.replace(/\boss\b/gi, "meg");
    t = t.replace(/\bvår\b/gi, "min");
    t = t.replace(/\bvårt\b/gi, "mitt");
    t = t.replace(/\bvåre\b/gi, "mine");
  }

  if (!opts.allowGeneralPronouns) {
    t = t.replace(/\bman\b/gi, "jeg");
    // Replace only likely pronoun uses of "en".
    t = t.replace(/\ben\b(?=\s+(?:blir|kan|må|skal|gjør|kjenner|tenker|får|har|er)\b)/gi, "jeg");
  }

  // Cleanup spacing.
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.!?…])/g, "$1");

  return t.trim();
}

function truncateSentences(text: string, maxSentences: number) {
  const t = (text ?? "").trim();
  if (!t) return "";

  const parts = t.split(/(?<=[.!?…])\s+/g);
  const kept = parts.slice(0, Math.max(1, maxSentences)).join(" ");
  return kept.trim();
}

function stripOvertInsightPhrases(text: string) {
  let t = (text ?? "").trim();
  if (!t) return "";

  // Remove therapist-y confirmations.
  t = t.replace(/\bdet gir(?:\s+litt)?\s+mening\b/gi, "ok");
  t = t.replace(/\bkanskje\s+jeg\s+kan\s+øve\b/gi, "kanskje jeg kan prøve");

  // Avoid explicit mechanism/explanation connectors (especially early).
  t = t.replace(/\b(slik\s+at|sånn\s+at|derfor|fordi)\b/gi, "");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.!?…])/g, "$1");

  return t.trim();
}

export function calibratePatientSpeech(
  text: string,
  opts: PatientSpeechCalibrationOptions = {},
): string {
  const phase = opts.phase;
  const defaultsByPhase = {
    early: { maxSentences: 1, maxChars: 120 },
    mid: { maxSentences: 1, maxChars: 140 },
    late: { maxSentences: 2, maxChars: 180 },
  } as const;

  const defaults = phase ? defaultsByPhase[phase] : { maxSentences: 1, maxChars: 140 };
  const maxSentences = opts.maxSentences ?? defaults.maxSentences;
  const maxChars = opts.maxChars ?? defaults.maxChars;

  // Order matters: sanitize voice first, then remove insight phrases, then truncate.
  let out = sanitizePatientSpeech(text, opts);
  out = stripOvertInsightPhrases(out);
  out = truncateSentences(out, maxSentences);

  if (maxChars && out.length > maxChars) {
    out = out.slice(0, maxChars).trim();
    // Avoid ending mid-word.
    out = out.replace(/\s+\S*$/g, "").trim();
    if (out && !/[.!?…]$/.test(out)) out = out + "…";
  }

  // Final cleanup
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}
