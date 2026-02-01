import type { DifficultyLevel, PatientState } from "../store/sessionStore";
import { MCT_RULES_V1, type Phase } from "./mctRulesConfig";
import { calibratePatientSpeech } from "./patientLanguage";

export type InterventionType = "sokratisk" | "eksperiment" | "mindfulness" | "verbal";

export type PatientTurnInput = {
  disorder: "GAD";
  difficultyLevel: DifficultyLevel;
  interventionType: InterventionType;
  therapistText: string;
  patientState: PatientState;
  /** 0-based therapist turn index before applying this intervention. */
  turnIndex?: number;
  /** Phase 1 only: which formulation question-type the therapist selected in the UI. */
  formulationSelectedKey?: FormulationKey | null;
};

export type SessionPhase = "formulation" | Phase;

export const FORMULATION_CHECKLIST = [
  "triggers",
  "whatIfThought",
  "worryChain",
  "emotions",
  "positiveMetaBelief",
  "negativeMetaBelief",
  "casStrategy",
] as const;

export type FormulationKey = (typeof FORMULATION_CHECKLIST)[number];

export type FormulationModel = Partial<Record<FormulationKey, string>>;

function getFormulationState(patientState: PatientState): {
  asked: Record<FormulationKey, boolean>;
  complete: boolean;
  phase2Started: boolean;
  therapyTurnBase: number | null;
  model: FormulationModel;
} {
  const rawAsked = ((patientState as any).simFormulationAsked ?? {}) as Partial<Record<FormulationKey, boolean>>;
  const asked = FORMULATION_CHECKLIST.reduce((acc, k) => {
    acc[k] = Boolean(rawAsked[k]);
    return acc;
  }, {} as Record<FormulationKey, boolean>);

  const complete = Boolean((patientState as any).simFormulationComplete);
  const phase2Started = Boolean((patientState as any).simPhase2Started);
  const therapyTurnBase =
    typeof (patientState as any).simTherapyTurnBase === "number" ? (patientState as any).simTherapyTurnBase : null;

  const model = (((patientState as any).simFormulationModel ?? {}) as FormulationModel) ?? {};

  return { asked, complete, phase2Started, therapyTurnBase, model };
}

export function getSessionPhase(turnIndex: number, patientState: PatientState): SessionPhase {
  const f = getFormulationState(patientState);
  // Stay in Phase 1 until the checklist is complete AND Phase 2 is explicitly started.
  if (!f.complete || !f.phase2Started) return "formulation";
  const base = f.therapyTurnBase ?? 0;
  const therapyTurn = Math.max(0, turnIndex - base);
  return getTurnPhase(therapyTurn);
}

export function getFormulationProgress(patientState: PatientState) {
  const f = getFormulationState(patientState);
  const done = FORMULATION_CHECKLIST.filter((k) => f.asked[k]).length;
  return {
    done,
    total: FORMULATION_CHECKLIST.length,
    complete: f.complete,
    startedPhase2: f.phase2Started,
    asked: f.asked,
  };
}

export function getFormulationModel(patientState: PatientState): FormulationModel {
  return getFormulationState(patientState).model;
}

export type PatientTurnOutput = {
  nextPatientState: Partial<PatientState>;
  patientReply: string;
  systemFeedback: string;
  signals: {
    resistance: number; // 0-100
    engagement: number; // 0-100
    cas: number; // 0-100 (derived)
    deltaCas: number; // negative is good (lower CAS)
  };
};

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

export function deriveCas(patientState: PatientState) {
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const threat = clamp01to100(patientState.beliefDanger ?? 0);
  return clamp01to100(
    MCT_RULES_V1.cas.uncontrollabilityWeight * uncontrollability +
      MCT_RULES_V1.cas.threatWeight * threat,
  );
}

export function inferEngagement(patientState: PatientState) {
  // Heuristic: lower threat + lower uncontrollability => higher engagement
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const threat = clamp01to100(patientState.beliefDanger ?? 0);
  return clamp01to100(
    100 -
      (MCT_RULES_V1.engagementProxy.uncontrollabilityWeight * uncontrollability +
        MCT_RULES_V1.engagementProxy.threatWeight * threat),
  );
}

function inferResistance(patientState: PatientState, difficultyLevel: DifficultyLevel) {
  const positiveBeliefs = clamp01to100(patientState.beliefPositive ?? 0);
  const cas = deriveCas(patientState);

  const base =
    MCT_RULES_V1.resistanceProxy.casWeight * cas +
    MCT_RULES_V1.resistanceProxy.positiveBeliefsWeight * positiveBeliefs;
  const difficultyBump = MCT_RULES_V1.resistanceProxy.difficultyBump[difficultyLevel];
  return clamp01to100(base + difficultyBump);
}

export function inferMetaWorry(patientState: PatientState) {
  // Proxy: uncontrollability belief + positive beliefs about worry.
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const positiveBeliefs = clamp01to100(patientState.beliefPositive ?? 0);
  return clamp01to100(
    MCT_RULES_V1.metaWorryProxy.uncontrollabilityWeight * uncontrollability +
      MCT_RULES_V1.metaWorryProxy.positiveBeliefsWeight * positiveBeliefs,
  );
}

function isContentCbtLike(interventionType: InterventionType) {
  return MCT_RULES_V1.interventions.contentCbtLike.includes(interventionType);
}

function isProcessMctLike(interventionType: InterventionType) {
  return MCT_RULES_V1.interventions.processMctLike.includes(interventionType);
}

export function getTurnPhase(turnIndex: number): Phase {
  if (turnIndex < MCT_RULES_V1.phase.earlyMaxTurnExclusive) return "early";
  if (turnIndex < MCT_RULES_V1.phase.midMaxTurnExclusive) return "mid";
  return "late";
}

function applyDirectCasDelta(next: Partial<PatientState>, deltaCas: number) {
  // CAS is derived: CAS = 0.55*U + 0.45*T.
  // If we move both U and T by the same delta, CAS moves by exactly delta.
  next.beliefUncontrollability = clamp01to100((next.beliefUncontrollability ?? 0) + deltaCas);
  next.beliefDanger = clamp01to100((next.beliefDanger ?? 0) + deltaCas);
}

function getLearnedEngagement(patientState: PatientState, difficultyLevel: DifficultyLevel) {
  const current = typeof patientState.simEngagement === "number" ? patientState.simEngagement : null;
  if (current !== null) return clamp01to100(current);

  const proxy = inferEngagement(patientState);
  const baseline = MCT_RULES_V1.engagementLearning.profileBaselineByDifficulty[difficultyLevel];
  const w = MCT_RULES_V1.engagementLearning.initialFromProxyWeight;
  return clamp01to100(w * proxy + (1 - w) * baseline);
}

function updateLearnedEngagement(params: {
  previousEngagement: number;
  previousCasDeltaEma: number;
  deltaCasObserved: number;
}) {
  const alpha = MCT_RULES_V1.engagementLearning.casDeltaEmaAlpha;
  const casDeltaEma = alpha * params.deltaCasObserved + (1 - alpha) * params.previousCasDeltaEma;

  const reward = MCT_RULES_V1.engagementLearning.rewardPerNegativeCasEma;
  const penalty = MCT_RULES_V1.engagementLearning.penaltyPerPositiveCasEma;

  const engagementNext =
    params.previousEngagement +
    reward * Math.max(0, -casDeltaEma) -
    penalty * Math.max(0, casDeltaEma);

  return {
    casDeltaEma: Math.round(casDeltaEma * 100) / 100,
    engagement: clamp01to100(
      Math.max(
        MCT_RULES_V1.engagementLearning.min,
        Math.min(MCT_RULES_V1.engagementLearning.max, engagementNext),
      ),
    ),
  };
}

function buildSystemFeedback(params: {
  difficultyLevel: DifficultyLevel;
  turnIndex: number;
  phase: SessionPhase;
  interventionType: InterventionType;
  casBefore: number;
  casAfter: number;
  metaWorryBefore: number;
  formulationInfo?: {
    selectedKey: FormulationKey | null;
    detectedKey: FormulationKey | null;
    credited: boolean;
  };
  deltas: {
    threat: number;
    uncontrollability: number;
    positive: number;
  };
  flags: {
    contentCbtPenalty: boolean;
    earlyProcessBackfire: boolean;
  };
}) {
  const deltaCas = Math.round((params.casAfter - params.casBefore) * 10) / 10;

  const lines: string[] = [];
  lines.push(`System: ${params.phase} • Difficulty ${params.difficultyLevel}`);

  if (params.phase === "formulation") {
    lines.push("Phase 1: Case formulation (GAD) — mål er kartlegging, ikke endring.");
    lines.push("Lock: Ingen CAS-reduksjon forventes ennå; intervensjoner ‘virker’ ikke i denne fasen.");
    if (params.formulationInfo) {
      const s = params.formulationInfo.selectedKey ?? "(none)";
      const d = params.formulationInfo.detectedKey ?? "(none)";
      lines.push(`Q-type: selected=${s} detected=${d} credited=${params.formulationInfo.credited ? "yes" : "no"}`);
    }
    const fp = getFormulationProgress((params as any).patientStateForFormulation ?? {});
    if (fp && typeof fp.done === "number") {
      lines.push(
        `Checklist: ${fp.done}/${fp.total} (trigger, what-if, chain, emotions, +meta, -meta, CAS strategy)`,
      );
    }
  }
  lines.push(`MCT-score (CAS): ${deltaCas <= 0 ? "" : "+"}${deltaCas} (målet er negativt)`);
  lines.push(`Meta-worry (proxy): ${Math.round(params.metaWorryBefore)}`);
  lines.push(
    `ΔU:${Math.round(params.deltas.uncontrollability * 10) / 10}  ΔT:${Math.round(params.deltas.threat * 10) / 10}  ΔPos:${Math.round(params.deltas.positive * 10) / 10}`,
  );

  if (params.flags.earlyProcessBackfire) {
    lines.push(
      "Rule: Tidlig DM/eksperiment ved høy meta-worry kan backfire (øker CAS + tro på ukontrollerbarhet).",
    );
  }

  if (params.flags.contentCbtPenalty) {
    lines.push(
      "Rule: Innholds-fokus (CBT på innhold/reassurance) øker ofte CAS (spesielt nivå 2–3) via mer grubling/monitorering.",
    );
  }

  if (!params.flags.earlyProcessBackfire && !params.flags.contentCbtPenalty) {
    if (isProcessMctLike(params.interventionType)) {
      lines.push("Rule: Prosess-fokus belønnes når det reduserer CAS, uavhengig av 'gode svar'.");
    } else {
      lines.push("Rule: Innholds-fokus belønnes ikke; mål er CAS-reduksjon og mindre monitorering.");
    }
  }

  return lines.join("\n");
}

function detectFormulationKey(therapistText: string): FormulationKey | null {
  const t = (therapistText ?? "").toLowerCase();
  if (!t) return null;

  const trimmed = t.trim();
  const looksLikeQuestion =
    /\?$/.test(trimmed) ||
    /\b(kan\s+du|klarer\s+du|hva|når|hvordan|hvilke|hvem|hvor)\b/.test(trimmed);

  // Triggers / context
  if (
    looksLikeQuestion &&
    /(hvilke\s+situasjon|i\s+hvilke\s+situasjon|hva\s+setter\s+i\s+gang|utløser|trigger|når\s+skjer)/.test(t)
  ) {
    return "triggers";
  }

  // Initial "what if" thought
  if (looksLikeQuestion && /(hva\s+hvis|what\s+if|første\s+tanken|den\s+første\s+tanken)/.test(t)) {
    return "whatIfThought";
  }

  // Worry chain / escalation ("and then what")
  if (
    looksLikeQuestion &&
    /(og\s+hvis\s+det\s+skjer\s*hva\s+da|hva\s+da\b|hva\s+er\s+neste|hva\s+skjer\s+videre|bekymringskjede|kjede)/.test(t)
  ) {
    return "worryChain";
  }

  // Emotions / affect
  if (
    looksLikeQuestion &&
    /(hva\s+føler|hvilke\s+følelse|hvordan\s+kjennes\s+det|hva\s+kjenner\s+du|hva\s+skjer\s+i\s+kroppen)/.test(t)
  ) {
    return "emotions";
  }

  // Positive meta-beliefs about worry (helpful/prepared)
  if (
    looksLikeQuestion &&
    /(hjelp(er|e)|nyttig|forberedt|unngå\s+å\s+bli\s+overrasket)/.test(t)
  ) {
    return "positiveMetaBelief";
  }

  // Negative meta-beliefs about worry (harmful/dangerous/uncontrollable)
  if (
    looksLikeQuestion &&
    /(farlig|skad|ødeleg|tar\s+knekken\s+på\s+meg|blir\s+gal|mister\s+kontroll|tåler\s+ikke|ukontroller)/.test(t)
  ) {
    return "negativeMetaBelief";
  }

  // CAS strategy (what the person does when worry starts)
  if (
    looksLikeQuestion &&
    /(hva\s+gjør\s+du\s+da|hvordan\s+håndter|hva\s+pleier\s+du\s+å\s+gjøre|hva\s+gjør\s+du\s+for\s+å\s+få\s+ro)/.test(t)
  ) {
    return "casStrategy";
  }

  return null;
}

function pickFormulationReply(params: {
  key: FormulationKey | null;
  difficultyLevel: DifficultyLevel;
  phase: SessionPhase;
}) {
  const suffix: Record<DifficultyLevel, string> = {
    1: "",
    2: " … og jeg blir fort dratt inn i det.",
    3: " … og det tar fort helt av.",
  };

  const base = (() => {
    switch (params.key) {
      case "triggers":
        return "Det er mest i enkelte situasjoner… spesielt når jeg skal legge meg eller når det blir stille.";
      case "whatIfThought":
        return "Det starter ofte med en sånn ‘hva hvis…’ tanke… som at jeg har glemt noe viktig.";
      case "worryChain":
        return "Og så går det videre til ‘hva hvis det blir verre’… og så spinner det bare videre.";
      case "emotions":
        return "Jeg blir urolig og stressa… det strammer seg i kroppen.";
      case "positiveMetaBelief":
        return "En del av meg føler at jeg må tenke gjennom alt for å være forberedt.";
      case "negativeMetaBelief":
        return "Jeg blir også redd for at det aldri stopper… at det tar helt over.";
      case "casStrategy":
        return "Jeg ender ofte med å sjekke ting eller tenke gjennom det om og om igjen… bare for å få litt ro.";
      default:
        return "Jeg vet ikke helt… men jeg kjenner at jeg blir urolig og dras inn i det.";
    }
  })();

  return calibratePatientSpeech(base + suffix[params.difficultyLevel], { phase: "formulation" });
}

function pickReply(params: {
  interventionType: InterventionType;
  difficultyLevel: DifficultyLevel;
  patientState: PatientState;
  nextState: Partial<PatientState>;
  therapistText: string;
  turnIndex?: number;
  flags: {
    contentCbtPenalty: boolean;
    earlyProcessBackfire: boolean;
  };
}) {
  const { interventionType, difficultyLevel, patientState, nextState, flags } = params;

  const threat = clamp01to100((nextState.beliefDanger ?? patientState.beliefDanger) ?? 0);
  const uncontrollability = clamp01to100(
    (nextState.beliefUncontrollability ?? patientState.beliefUncontrollability) ?? 0,
  );
  const positive = clamp01to100((nextState.beliefPositive ?? patientState.beliefPositive) ?? 0);

  const suffixByDifficulty: Record<DifficultyLevel, string> = {
    1: "",
    2: " … men jeg glipper fort.",
    3: " … og det tar fort helt av.",
  };

  // IMPORTANT: Patient replies must be everyday speech.
  // Never use terms like: "prosess", "analyse-modus", "metakognisjon", "CAS".
  // Keep it short, vague, hesitant.

  if (flags.earlyProcessBackfire) {
    if (interventionType === "eksperiment" || interventionType === "mindfulness") {
      return (
        "Når jeg prøver sånn… blir jeg bare mer urolig." +
        suffixByDifficulty[difficultyLevel]
      );
    }
  }

  if (flags.contentCbtPenalty) {
    return (
      "Når jeg går inn i detaljene… blir jeg bare mer usikker." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "mindfulness") {
    return (
      "Det var litt rart… men jeg ble litt roligere et øyeblikk." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "eksperiment") {
    return (
      "Ok… jeg kan prøve å vente litt. Men det er vanskelig." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "sokratisk") {
    return (
      "Jeg vet ikke… jeg blir bare mer i tvil." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  // verbal
  if (positive >= 55) {
    return (
      "Jeg føler jeg må tenke gjennom alt… og det er vanskelig å slippe." +
      suffixByDifficulty[difficultyLevel]
    );
  }
  return (
    "Ok… jeg kan prøve." +
    suffixByDifficulty[difficultyLevel]
  );
}

export function simulateGadPatientTurn(input: PatientTurnInput): PatientTurnOutput {
  const { difficultyLevel, interventionType, patientState } = input;

  const turnIndex = input.turnIndex ?? 0;
  const sessionPhase = getSessionPhase(turnIndex, patientState);
  const formulation = getFormulationState(patientState);
  const phaseForRules: Phase = sessionPhase === "formulation" ? "early" : sessionPhase;

  const profile = MCT_RULES_V1.difficultyProfiles[difficultyLevel];
  const resistance = inferResistance(patientState, difficultyLevel);
  const engagement = getLearnedEngagement(patientState, difficultyLevel);

  // Convert to a 0..1 "cooperation" scalar: high resistance reduces effect sizes.
  const cooperation =
    clamp01to100(engagement - MCT_RULES_V1.cooperation.resistanceWeight * resistance) / 100;

  const metaWorry = inferMetaWorry(patientState);
  const casBefore = deriveCas(patientState);

  // MCT: score is CAS change (not "good answers").
  // We'll model changes primarily via a CAS delta, plus targeted meta-belief shifts.
  let deltaThreat = 0;
  let deltaUncontrollability = 0;
  let deltaPositive = 0;

  let contentCbtPenalty = false;
  let earlyProcessBackfire = false;

  // Phase 1: Case formulation (no interventions work yet; no CAS reduction expected).
  if (sessionPhase === "formulation") {
    const detectedKey = detectFormulationKey(input.therapistText);
    const selectedKey = input.formulationSelectedKey ?? null;

    // Progression is locked behind selecting the right question-type (not free text alone).
    const credited = Boolean(detectedKey && selectedKey && detectedKey === selectedKey);

    const askedNext = { ...formulation.asked };
    if (credited && detectedKey) askedNext[detectedKey] = true;

    const done = FORMULATION_CHECKLIST.filter((k) => askedNext[k]).length;
    const completeNow = done >= FORMULATION_CHECKLIST.length;

    // Minimal state movement: allow slight upward drift (talking about problems), but do not allow CAS reduction.
    const nextPatientState: Partial<PatientState> = {
      simFormulationAsked: askedNext,
      simFormulationComplete: formulation.complete || completeNow,
    };

    // Add a small drift upwards (scaled by difficulty) so CAS doesn't accidentally drop.
    const drift = Math.max(0, profile.casStickiness) * 1.1;
    nextPatientState.beliefUncontrollability = clamp01to100((patientState.beliefUncontrollability ?? 0) + drift);
    nextPatientState.beliefDanger = clamp01to100((patientState.beliefDanger ?? 0) + drift);
    nextPatientState.beliefPositive = clamp01to100((patientState.beliefPositive ?? 0) + drift * 0.3);

    // Enforce: no CAS reduction in formulation.
    const casAfter0 = deriveCas({ ...patientState, ...nextPatientState });
    if (casAfter0 < casBefore) {
      applyDirectCasDelta(nextPatientState, casBefore - casAfter0);
    }

    const casAfter = deriveCas({ ...patientState, ...nextPatientState });
    const deltaCasObserved = casAfter - casBefore;

    const patientReply = credited
      ? pickFormulationReply({ key: detectedKey, difficultyLevel, phase: sessionPhase })
      : calibratePatientSpeech(
          "Jeg vet ikke… jeg blir bare urolig. Kan du spørre litt mer konkret?",
          { phase: "formulation" },
        );

    if (credited && detectedKey) {
      const prevModel = (formulation.model ?? {}) as any;
      nextPatientState.simFormulationModel = { ...prevModel, [detectedKey]: patientReply };
    }

    const systemFeedback = buildSystemFeedback({
      difficultyLevel,
      turnIndex,
      phase: sessionPhase,
      interventionType,
      casBefore,
      casAfter,
      metaWorryBefore: metaWorry,
      formulationInfo: { selectedKey, detectedKey, credited },
      deltas: {
        threat: (nextPatientState.beliefDanger ?? 0) - (patientState.beliefDanger ?? 0),
        uncontrollability:
          (nextPatientState.beliefUncontrollability ?? 0) - (patientState.beliefUncontrollability ?? 0),
        positive: (nextPatientState.beliefPositive ?? 0) - (patientState.beliefPositive ?? 0),
      },
      flags: {
        contentCbtPenalty: false,
        earlyProcessBackfire: false,
      },
      // Provide patientState for formulation progress display.
      patientStateForFormulation: { ...patientState, simFormulationAsked: askedNext, simFormulationComplete: formulation.complete || completeNow },
    } as any);

    return {
      nextPatientState,
      patientReply,
      systemFeedback,
      signals: {
        resistance: clamp01to100(resistance),
        engagement: clamp01to100(engagement),
        cas: casAfter,
        deltaCas: Math.round(deltaCasObserved * 10) / 10,
      },
    };
  }

  // Baseline CAS stickiness: higher difficulty tends to creep CAS back up, especially when meta-worry is high.
  const metaWorryDrive = (metaWorry - 50) / 50; // approx -1..+1
  const driftMagnitude =
    profile.casStickiness * MCT_RULES_V1.drift.baseMultiplier * Math.max(0, metaWorryDrive);
  deltaUncontrollability += driftMagnitude * MCT_RULES_V1.drift.uncontrollabilityWeight;
  deltaThreat += driftMagnitude * MCT_RULES_V1.drift.threatWeight;

  // Intervention effects: process vs content.
  if (isProcessMctLike(interventionType)) {
    // Process-focus can reduce CAS, scaled by cooperation and difficulty.
    deltaThreat += MCT_RULES_V1.interventions.processDeltaThreat[interventionType] ?? 0;
    deltaUncontrollability += MCT_RULES_V1.interventions.processDeltaUncontrollability[interventionType] ?? 0;
    // Successful process work tends to weaken positive beliefs about worry.
    deltaPositive += MCT_RULES_V1.interventions.processDeltaPositive[interventionType] ?? 0;
  } else {
    // Content-focus is not rewarded: often increases CAS via rumination/monitoring.
    contentCbtPenalty = difficultyLevel >= 2;
    const v = difficultyLevel === 1 ? MCT_RULES_V1.interventions.contentLevel1 : MCT_RULES_V1.interventions.contentLevel2plus;
    // Use explicit variable deltas so meta-worry and uncontrollability don't collapse into the same thing.
    // Content focus especially increases threat monitoring and the felt uncontrollability.
    deltaThreat += difficultyLevel === 1 ? v.deltaThreat : Math.max(v.deltaThreat, profile.contentCbtPenalty);
    deltaUncontrollability += v.deltaUncontrollability;
    deltaPositive += v.deltaPositive;
  }

  // Timing-sensitive backfire: level 3 early DM/experiment when meta-worry is high.
  const backfireCfg = MCT_RULES_V1.backfire.level3;
  const isEarly = phaseForRules === "early";
  const highMetaWorry = metaWorry >= MCT_RULES_V1.metaWorryProxy.highThreshold;
  const backfireAllowedByPhase = backfireCfg.earlyPhaseOnly ? isEarly : true;
  const backfireAllowedByMeta = backfireCfg.requiredHighMetaWorry ? highMetaWorry : true;
  if (difficultyLevel === 3 && backfireAllowedByPhase && backfireAllowedByMeta && isProcessMctLike(interventionType)) {
    earlyProcessBackfire = true;
    // Backfire must hit at least two state variables (always U + T, and usually positive beliefs).
    deltaUncontrollability += backfireCfg.deltaUncontrollability;
    deltaThreat += backfireCfg.deltaThreat;
    deltaPositive += backfireCfg.deltaPositive;
  }

  // Apply gain + cooperation. Key: reward CAS reduction regardless of the "quality" of therapist wording.
  const scale = profile.gain * (MCT_RULES_V1.cooperation.minScale + MCT_RULES_V1.cooperation.maxScale * cooperation);
  const scaledDeltaThreat = deltaThreat * scale;
  const scaledDeltaUncontrollability = deltaUncontrollability * scale;
  const scaledDeltaPositive = deltaPositive * scale;

  const nextPatientState: Partial<PatientState> = {
    beliefUncontrollability: clamp01to100(
      (patientState.beliefUncontrollability ?? 0) + scaledDeltaUncontrollability,
    ),
    beliefDanger: clamp01to100((patientState.beliefDanger ?? 0) + scaledDeltaThreat),
    beliefPositive: clamp01to100((patientState.beliefPositive ?? 0) + scaledDeltaPositive),
  };

  const casAfter = deriveCas({
    ...patientState,
    ...nextPatientState,
  });
  const deltaCasObserved = casAfter - casBefore;

  const prevCasEma = typeof patientState.simCasDeltaEma === "number" ? patientState.simCasDeltaEma : 0;
  const engagementUpdate = updateLearnedEngagement({
    previousEngagement: engagement,
    previousCasDeltaEma: prevCasEma,
    deltaCasObserved,
  });

  nextPatientState.simCasDeltaEma = engagementUpdate.casDeltaEma;
  nextPatientState.simEngagement = engagementUpdate.engagement;

  const patientReply = calibratePatientSpeech(
    pickReply({
    interventionType,
    difficultyLevel,
    patientState,
    nextState: nextPatientState,
    therapistText: input.therapistText,
    turnIndex,
    flags: {
      contentCbtPenalty,
      earlyProcessBackfire,
    },
    }),
    { phase: phaseForRules },
  );

  const systemFeedback = buildSystemFeedback({
    difficultyLevel,
    turnIndex,
    phase: phaseForRules,
    interventionType,
    casBefore,
    casAfter,
    metaWorryBefore: metaWorry,
    deltas: {
      threat: (nextPatientState.beliefDanger ?? 0) - (patientState.beliefDanger ?? 0),
      uncontrollability:
        (nextPatientState.beliefUncontrollability ?? 0) - (patientState.beliefUncontrollability ?? 0),
      positive: (nextPatientState.beliefPositive ?? 0) - (patientState.beliefPositive ?? 0),
    },
    flags: {
      contentCbtPenalty,
      earlyProcessBackfire,
    },
  });

  return {
    nextPatientState,
    patientReply,
    systemFeedback,
    signals: {
      resistance: clamp01to100(resistance),
      engagement: clamp01to100(engagementUpdate.engagement),
      cas: casAfter,
      deltaCas: Math.round(deltaCasObserved * 10) / 10,
    },
  };
}
