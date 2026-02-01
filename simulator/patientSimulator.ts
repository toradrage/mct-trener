import type { DifficultyLevel, PatientState } from "../store/sessionStore";
import { MCT_RULES_V1, type Phase } from "./mctRulesConfig";

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

function buildSystemFeedback(params: {
  difficultyLevel: DifficultyLevel;
  turnIndex: number;
  phase: Phase;
  interventionType: InterventionType;
  casBefore: number;
  casAfter: number;
  metaWorryBefore: number;
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

  const metaWorry = clamp01to100(
    MCT_RULES_V1.metaWorryProxy.uncontrollabilityWeight * uncontrollability +
      MCT_RULES_V1.metaWorryProxy.positiveBeliefsWeight * positive,
  );
  const highMetaWorry = metaWorry >= MCT_RULES_V1.metaWorryProxy.highThreshold;

  const suffixByDifficulty: Record<DifficultyLevel, string> = {
    1: "",
    2: " Jeg merker at jeg lett blir dratt inn i det igjen.",
    3: " Det kicker fort i gang hos meg nå.",
  };

  if (flags.earlyProcessBackfire) {
    if (interventionType === "eksperiment" || interventionType === "mindfulness") {
      return (
        "Når jeg prøver å gjøre det mer 'prosessorientert', begynner jeg å overvåke om jeg gjør det riktig. " +
        "Da blir jeg redd for at bekymringen er ukontrollerbar, og CAS skyter i været." +
        suffixByDifficulty[difficultyLevel]
      );
    }
  }

  if (flags.contentCbtPenalty) {
    return (
      "Når vi går inn i innholdet, merker jeg at jeg begynner å analysere og sammenligne " +
      "hele tiden. Det blir mer grubling/monitorering, og CAS tar mer plass." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "mindfulness") {
    if (highMetaWorry) {
      return (
        "Når jeg lar tankene være der uten å gå i gang med dem, kjenner jeg at trangen til å overvåke " +
        "og kontrollere synker litt. Det er fortsatt ubehag, men jeg får et lite mellomrom." +
        suffixByDifficulty[difficultyLevel]
      );
    }
    return (
      "Det var uvant, men jeg klarte litt mer å observere bekymringstrangen uten å gå inn i den." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "eksperiment") {
    return (
      "Ok, jeg kan prøve å utsette/ikke gjøre bekymringen med en gang. " +
      "Jeg merker at CAS ikke tar fullt så mye plass når jeg ikke mater det." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "sokratisk") {
    return (
      "Spørsmålene gjør at jeg legger merke til hvordan jeg går rett i analyse-modus. " +
      "Jeg kan se litt tydeligere at det er prosessen som drar meg inn — ikke at jeg må finne et svar." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  // verbal
  if (positive >= 55) {
    return (
      "En del av meg tror fortsatt at bekymring hjelper meg å være forberedt. " +
      "Da blir det vanskelig å ikke gå inn i den, selv om jeg ser at det koster." +
      suffixByDifficulty[difficultyLevel]
    );
  }
  return (
    "Det gir mening. Kanskje jeg kan øve mer på å legge merke til CAS uten å følge det, " +
    "i stedet for å prøve å få full kontroll på det." +
    suffixByDifficulty[difficultyLevel]
  );
}

export function simulateGadPatientTurn(input: PatientTurnInput): PatientTurnOutput {
  const { difficultyLevel, interventionType, patientState } = input;

  const turnIndex = input.turnIndex ?? 0;
  const phase = getTurnPhase(turnIndex);

  const profile = MCT_RULES_V1.difficultyProfiles[difficultyLevel];
  const resistance = inferResistance(patientState, difficultyLevel);
  const engagement = inferEngagement(patientState);

  const engagementBoost = profile.engagementBoost;

  // Convert to a 0..1 "cooperation" scalar: high resistance reduces effect sizes.
  const cooperation =
    clamp01to100(
      engagement + engagementBoost - MCT_RULES_V1.cooperation.resistanceWeight * resistance,
    ) / 100;

  const metaWorry = inferMetaWorry(patientState);
  const casBefore = deriveCas(patientState);

  // MCT: score is CAS change (not "good answers").
  // We'll model changes primarily via a CAS delta, plus targeted meta-belief shifts.
  let deltaCas = 0;
  let deltaPositive = 0;

  let contentCbtPenalty = false;
  let earlyProcessBackfire = false;

  // Baseline CAS stickiness: higher difficulty tends to creep CAS back up, especially when meta-worry is high.
  const metaWorryDrive = (metaWorry - 50) / 50; // approx -1..+1
  const drift = profile.casStickiness * MCT_RULES_V1.drift.baseMultiplier * Math.max(0, metaWorryDrive);
  deltaCas += drift;

  // Intervention effects: process vs content.
  if (isProcessMctLike(interventionType)) {
    // Process-focus can reduce CAS, scaled by cooperation and difficulty.
    deltaCas += MCT_RULES_V1.interventions.processDeltaCas[interventionType] ?? 0;
    // Successful process work tends to weaken positive beliefs about worry.
    deltaPositive += MCT_RULES_V1.interventions.processDeltaPositive[interventionType] ?? 0;
  } else {
    // Content-focus is not rewarded: often increases CAS via rumination/monitoring.
    contentCbtPenalty = difficultyLevel >= 2;
    const base =
      difficultyLevel === 1 ? MCT_RULES_V1.interventions.contentLevel1DeltaCas : profile.contentCbtPenalty;
    deltaCas += base;
    // Content focus can reinforce "worry is useful" especially in level 2-3.
    deltaPositive += difficultyLevel === 1 ? 0 : MCT_RULES_V1.interventions.contentDeltaPositive;
  }

  // Timing-sensitive backfire: level 3 early DM/experiment when meta-worry is high.
  const backfireCfg = MCT_RULES_V1.backfire.level3;
  const isEarly = phase === "early";
  const highMetaWorry = metaWorry >= MCT_RULES_V1.metaWorryProxy.highThreshold;
  const backfireAllowedByPhase = backfireCfg.earlyPhaseOnly ? isEarly : true;
  const backfireAllowedByMeta = backfireCfg.requiredHighMetaWorry ? highMetaWorry : true;
  if (difficultyLevel === 3 && backfireAllowedByPhase && backfireAllowedByMeta && isProcessMctLike(interventionType)) {
    earlyProcessBackfire = true;
    // Backfire: they start monitoring/controlling the technique -> CAS spikes and uncontrollability belief rises.
    deltaCas += backfireCfg.extraDeltaCas * profile.earlyProcessBackfireSensitivity;
    // Also temporarily strengthens positive belief about worry/control attempts.
    deltaPositive += backfireCfg.extraDeltaPositive;
  }

  // Apply gain + cooperation. Key: reward CAS reduction regardless of the "quality" of therapist wording.
  const scale = profile.gain * (MCT_RULES_V1.cooperation.minScale + MCT_RULES_V1.cooperation.maxScale * cooperation);
  const scaledDeltaCas = deltaCas * scale;
  const scaledDeltaPositive = deltaPositive * scale;

  const nextPatientState: Partial<PatientState> = {
    beliefUncontrollability: clamp01to100(patientState.beliefUncontrollability ?? 0),
    beliefDanger: clamp01to100(patientState.beliefDanger ?? 0),
    beliefPositive: clamp01to100((patientState.beliefPositive ?? 0) + scaledDeltaPositive),
  };
  applyDirectCasDelta(nextPatientState, scaledDeltaCas);

  const casAfter = deriveCas({
    ...patientState,
    ...nextPatientState,
  });
  const deltaCasObserved = casAfter - casBefore;

  const patientReply = pickReply({
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
  });

  const systemFeedback = buildSystemFeedback({
    difficultyLevel,
    turnIndex,
    phase,
    interventionType,
    casBefore,
    casAfter,
    metaWorryBefore: metaWorry,
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
      engagement: clamp01to100(engagement),
      cas: casAfter,
      deltaCas: clamp01to100(Math.abs(deltaCasObserved)) === 0 ? 0 : deltaCasObserved,
    },
  };
}
