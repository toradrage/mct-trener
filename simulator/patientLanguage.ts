export type PatientVoiceOptions = {
  /** Allow generalizing pronouns like "man" / "en". Default: false. */
  allowGeneralPronouns?: boolean;
  /** Allow "vi"-language. Default: false. */
  allowWe?: boolean;
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
