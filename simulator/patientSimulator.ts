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
};

export type SessionPhase = "formulation" | Phase;

export const FORMULATION_CHECKLIST = [
  "triggers",
  "worryThemes",
  "positiveBeliefs",
  "uncontrollabilityBeliefs",
  "copingBehaviors",
] as const;

export type FormulationKey = (typeof FORMULATION_CHECKLIST)[number];

function getFormulationState(patientState: PatientState): {
  asked: Record<FormulationKey, boolean>;
  complete: boolean;
  therapyTurnBase: number | null;
} {
  const rawAsked = ((patientState as any).simFormulationAsked ?? {}) as Partial<Record<FormulationKey, boolean>>;
  const asked = FORMULATION_CHECKLIST.reduce((acc, k) => {
    acc[k] = Boolean(rawAsked[k]);
    return acc;
  }, {} as Record<FormulationKey, boolean>);

  const complete = Boolean((patientState as any).simFormulationComplete);
  const therapyTurnBase =
    typeof (patientState as any).simTherapyTurnBase === "number" ? (patientState as any).simTherapyTurnBase : null;

  return { asked, complete, therapyTurnBase };
}

export function getSessionPhase(turnIndex: number, patientState: PatientState): SessionPhase {
  const f = getFormulationState(patientState);
  if (!f.complete) return "formulation";
  const base = f.therapyTurnBase ?? 0;
  const therapyTurn = Math.max(0, turnIndex - base);
  return getTurnPhase(therapyTurn);
}

export function getFormulationProgress(patientState: PatientState) {
  const f = getFormulationState(patientState);
  const done = FORMULATION_CHECKLIST.filter((k) => f.asked[k]).length;
  return { done, total: FORMULATION_CHECKLIST.length, complete: f.complete, asked: f.asked };
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
    const fp = getFormulationProgress((params as any).patientStateForFormulation ?? {});
    if (fp && typeof fp.done === "number") {
      lines.push(`Checklist: ${fp.done}/${fp.total} (triggers, themes, pos beliefs, uncontrollability, coping)`);
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

  // Triggers / context
  if (
    /(når|hvilke\s+situasjon|i\s+hvilke\s+situasjon|hva\s+setter\s+i\s+gang|utløser|trigger)/.test(t)
  ) {
    return "triggers";
  }

  // Worry themes / content (everyday wording)
  if (
    /(hva\s+bekymrer|hva\s+går\s+bekymring|hvilke\s+tanker|hva\s+er\s+du\s+redd\s+for|hva\s+kan\s+skje)/.test(t)
  ) {
    return "worryThemes";
  }

  // Positive beliefs about worry (helpful/prepared)
  if (/(hjelp(er|e)|nyttig|forberedt|klar|kontroll|holde\s+oversikt)/.test(t)) {
    return "positiveBeliefs";
  }

  // Uncontrollability beliefs / can't stop
  if (/(klarer\s+du\s+å\s+stoppe|får\s+du\s+stoppet|ukontroller|slutter\s+det\s+av\s+seg\s+selv|mister\s+kontroll)/.test(t)) {
    return "uncontrollabilityBeliefs";
  }

  // Coping / safety behaviors
  if (/(hva\s+gjør\s+du\s+da|hvordan\s+håndter|sjekk(er|e)|forsikring|unngår|google|ringer|berolig)/.test(t)) {
    return "copingBehaviors";
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
      case "worryThemes":
        return "Det handler ofte om at noe skal gå galt… jobb, helse, familien. Jeg klarer ikke helt å peke på én ting.";
      case "positiveBeliefs":
        return "En del av meg føler at jeg må tenke gjennom alt for å være forberedt. Hvis jeg ikke gjør det, føles det uforsvarlig.";
      case "uncontrollabilityBeliefs":
        return "Jeg prøver å stoppe, men det bare fortsetter. Det kjennes som om det tar over.";
      case "copingBehaviors":
        return "Jeg ender ofte med å sjekke ting eller spørre andre… og så roer det seg litt, men bare en liten stund.";
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
    const key = detectFormulationKey(input.therapistText);
    const askedNext = { ...formulation.asked };
    if (key) askedNext[key] = true;

    const done = FORMULATION_CHECKLIST.filter((k) => askedNext[k]).length;
    const completeNow = done >= FORMULATION_CHECKLIST.length;

    // Minimal state movement: allow slight upward drift (talking about problems), but do not allow CAS reduction.
    const nextPatientState: Partial<PatientState> = {
      simFormulationAsked: askedNext,
      simFormulationComplete: formulation.complete || completeNow,
      // When formulation becomes complete, start therapy phase turn counting next turn.
      simTherapyTurnBase:
        formulation.therapyTurnBase ?? (completeNow ? turnIndex + 1 : null) ?? undefined,
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

    const patientReply = pickFormulationReply({ key, difficultyLevel, phase: sessionPhase });

    const systemFeedback = buildSystemFeedback({
      difficultyLevel,
      turnIndex,
      phase: sessionPhase,
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
