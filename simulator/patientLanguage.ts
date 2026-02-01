export type PatientVoiceOptions = {
  /** Allow generalizing pronouns like "man" / "en". Default: false. */
  allowGeneralPronouns?: boolean;
  /** Allow "vi"-language. Default: false. */
  allowWe?: boolean;
};

export type PatientSpeechCalibrationOptions = PatientVoiceOptions & {
  /** Optional phase for stricter early-session language. */
  phase?: "formulation" | "early" | "mid" | "late";
  /** Maximum number of sentences to keep. Defaults vary by phase. */
  maxSentences?: number;
  /** Maximum characters to keep. Defaults vary by phase. */
  maxChars?: number;
};

const WE_WORDS = /\b(vi|oss|vår|vårt|våre)\b/i;
const MAN_WORD = /\bman\b/i;

// "en" is ambiguous in Norwegian (number vs pronoun). We only flag likely pronoun uses.
const EN_PRONOUN_LIKELY = /\ben\s+(?:blir|kan|må|skal|gjør|kjenner|tenker|får|har|er)\b/i;

const THERAPY_TERMS =
  /\b(prosess|analyse-modus|metakognisjon|metakognitiv\w*|cas|monitorering|eksperiment|intervensjon|systemfeedback|system|regel|mct|cbt)\b/i;

export function violatesPatientVoice(text: string, opts: PatientVoiceOptions = {}): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;

  if (!opts.allowWe && WE_WORDS.test(t)) return true;
  if (!opts.allowGeneralPronouns && MAN_WORD.test(t)) return true;
  if (!opts.allowGeneralPronouns && EN_PRONOUN_LIKELY.test(t)) return true;

  return false;
}

export function violatesPatientLanguageHardRules(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;

  // Therapy terminology should never appear in patient speech.
  if (THERAPY_TERMS.test(t)) return true;

  // Explicit insight / mechanism statements.
  if (
    /\b(jeg\s+(?:ser|skjønner|innser|har\s+forstått|har\s+læ(æ|r)t))\b/i.test(t) ||
    /\b(det\s+handler\s+om|det\s+er\s+egentlig|mekanisme|strategi)\b/i.test(t)
  ) {
    return true;
  }

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

  // Remove therapy terminology if it slips in.
  t = t.replace(THERAPY_TERMS, "");

  // Remove explicit insight/mechanism claims.
  t = t.replace(/\b(jeg\s+(?:ser|skjønner|innser|har\s+forstått|har\s+læ(æ|r)t))\b/gi, "");
  t = t.replace(/\b(det\s+handler\s+om|det\s+er\s+egentlig|mekanisme|strategi)\b/gi, "");

  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([,.!?…])/g, "$1");

  return t.trim();
}

function fallbackPatientUtterance(phase?: "formulation" | "early" | "mid" | "late") {
  if (phase === "late") return "Jeg vet ikke… men det føles litt lettere i kroppen.";
  if (phase === "mid") return "Jeg vet ikke… men jeg kjenner at jeg blir urolig og dras inn i det.";
  if (phase === "formulation") return "Jeg vet ikke… men jeg blir veldig urolig, og det tar fort helt av.";
  // early default: confusion + intensity/impulse/consequence (not empty).
  return "Jeg vet ikke… men jeg blir veldig urolig, og det tar fort helt av.";
}

function hasExperienceAnchor(text: string) {
  const t = (text ?? "").toLowerCase();
  // At least one of: feeling, impulse, consequence.
  return (
    /\b(urolig|stress|stressa|tvil|redd|panikk|stram|klump|vondt|kvalm|hjerte)\b/.test(t) ||
    /\b(må\s+tenke|må\s+sjekke|klarer\s+ikke\s+stoppe|får\s+ikke\s+stoppet|dras\s+inn|spinner)\b/.test(t) ||
    /\b(blir\s+verre|eskalerer|tar\s+av|øker|bare\s+mer)\b/.test(t)
  );
}

function anchorUncertainty(text: string, phase?: "formulation" | "early" | "mid" | "late") {
  let t = (text ?? "").trim();
  if (!t) return t;

  const startsWithUncertainty = /^jeg\s+vet\s+ikke\b/i.test(t);
  if (!startsWithUncertainty) return t;
  if (hasExperienceAnchor(t)) return t;

  // Append an experiential anchor without adding insight/mechanism.
  const tailByPhase: Record<"formulation" | "early" | "mid" | "late", string> = {
    formulation: "… men jeg blir veldig urolig, og det tar fort helt av.",
    early: "… men jeg blir veldig urolig, og det tar fort helt av.",
    mid: "… men jeg kjenner at jeg blir urolig og dras inn i det.",
    late: "… men jeg kjenner det i kroppen, og det er litt mindre intenst.",
  };

  const p: "formulation" | "early" | "mid" | "late" = phase ?? "mid";

  // Avoid doubling punctuation if the model already added ellipsis.
  if (/…\s*$/.test(t)) {
    return (t.replace(/…\s*$/, "") + tailByPhase[p]).trim();
  }
  if (/[.!?]$/.test(t)) {
    return (t.replace(/[.!?]\s*$/, "") + tailByPhase[p]).trim();
  }
  return (t + " " + tailByPhase[p]).replace(/\s{2,}/g, " ").trim();
}

export function calibratePatientSpeech(
  text: string,
  opts: PatientSpeechCalibrationOptions = {},
): string {
  const phase = opts.phase;
  const defaultsByPhase = {
    formulation: { maxSentences: 1, maxChars: 110 },
    early: { maxSentences: 1, maxChars: 110 },
    mid: { maxSentences: 1, maxChars: 140 },
    late: { maxSentences: 2, maxChars: 180 },
  } as const;

  const defaults = phase ? (defaultsByPhase as any)[phase] : { maxSentences: 1, maxChars: 140 };
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

  // If the reply starts with uncertainty, it must still be anchored in experience.
  out = anchorUncertainty(out, phase);

  // If filtering removed too much, fall back to a safe experiential utterance.
  if (!out) out = fallbackPatientUtterance(phase);

  // If it still violates hard rules after calibration, fall back.
  if (violatesPatientVoice(out, opts) || violatesPatientLanguageHardRules(out)) {
    out = sanitizePatientSpeech(fallbackPatientUtterance(phase), opts);
  }

  return out;
}
