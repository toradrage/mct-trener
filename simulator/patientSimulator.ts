import type { DifficultyLevel, PatientState } from "../store/sessionStore";
import { MCT_RULES_V1, type Phase } from "./mctRulesConfig";
import { sanitizePatientSpeech } from "./patientLanguage";

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
  phase: Phase;
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
  lines.push(`System: ${params.phase} turn • Difficulty ${params.difficultyLevel}`);
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
    2: " Jeg blir fort dratt tilbake i det.",
    3: " Det tar helt av i hodet mitt med en gang.",
  };

  // IMPORTANT: Patient replies must be everyday speech.
  // Never use terms like: "prosess", "analyse-modus", "metakognisjon", "CAS".
  // Keep it short, vague, hesitant.

  if (flags.earlyProcessBackfire) {
    if (interventionType === "eksperiment" || interventionType === "mindfulness") {
      return (
        "Når jeg prøver å gjøre det på den måten, begynner jeg å kjenne etter hele tiden… " +
        "og da blir jeg bare mer urolig." +
        suffixByDifficulty[difficultyLevel]
      );
    }
  }

  if (flags.contentCbtPenalty) {
    return (
      "Når jeg begynner å gå inn i detaljene, blir jeg bare mer usikker… " +
      "jeg begynner å gruble med én gang." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "mindfulness") {
    return (
      "Det var litt rart, men i et lite øyeblikk klarte jeg å la det bare være." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "eksperiment") {
    return (
      "Ok… jeg kan prøve å vente litt før jeg går helt inn i bekymringen. " +
      "Men jeg er ikke sikker på om jeg får det til." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "sokratisk") {
    return (
      "Jeg vet ikke helt… når du spør sånn, blir jeg mest bare mer i tvil." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  // verbal
  if (positive >= 55) {
    return (
      "Jeg føler litt at jeg må tenke gjennom alt for å være forberedt… " +
      "så det er vanskelig å slippe." +
      suffixByDifficulty[difficultyLevel]
    );
  }
  return (
    "Det gir litt mening… men jeg trenger nok å prøve det noen ganger før det sitter." +
    suffixByDifficulty[difficultyLevel]
  );
}

export function simulateGadPatientTurn(input: PatientTurnInput): PatientTurnOutput {
  const { difficultyLevel, interventionType, patientState } = input;

  const turnIndex = input.turnIndex ?? 0;
  const phase = getTurnPhase(turnIndex);

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
  const isEarly = phase === "early";
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

  const patientReply = sanitizePatientSpeech(
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
  );

  const systemFeedback = buildSystemFeedback({
    difficultyLevel,
    turnIndex,
    phase,
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
