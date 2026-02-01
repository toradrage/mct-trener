import type { DifficultyLevel, PatientState } from "../store/sessionStore";

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

function deriveCas(patientState: PatientState) {
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const threat = clamp01to100(patientState.beliefDanger ?? 0);
  return clamp01to100(0.55 * uncontrollability + 0.45 * threat);
}

type MctDifficultyProfile = {
  id: DifficultyLevel;
  label: string;
  // Baseline tendency to return to higher CAS between turns ("stickiness").
  casStickiness: number;
  // How much content-focus tends to increase CAS.
  contentCbtPenalty: number;
  // How sensitive the patient is to early process interventions (DM/experiment) when meta-worry is high.
  earlyProcessBackfireSensitivity: number;
  // Global gain multiplier (lower = less therapeutic movement).
  gain: number;
};

function getDifficultyProfile(difficultyLevel: DifficultyLevel): MctDifficultyProfile {
  if (difficultyLevel === 1) {
    return {
      id: 1,
      label: "Nivå 1 (samarbeidende / lav meta-worry)",
      casStickiness: 0.15,
      contentCbtPenalty: 2,
      earlyProcessBackfireSensitivity: 0.15,
      gain: 1,
    };
  }
  if (difficultyLevel === 2) {
    return {
      id: 2,
      label: "Nivå 2 (fastlåst CAS / ruminerer lett)",
      casStickiness: 0.35,
      contentCbtPenalty: 8,
      earlyProcessBackfireSensitivity: 0.35,
      gain: 0.7,
    };
  }
  return {
    id: 3,
    label: "Nivå 3 (høy meta-worry / tidlig backfire)",
    casStickiness: 0.55,
    contentCbtPenalty: 12,
    earlyProcessBackfireSensitivity: 0.7,
    gain: 0.55,
  };
}

function inferEngagement(patientState: PatientState) {
  // Heuristic: lower threat + lower uncontrollability => higher engagement
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const threat = clamp01to100(patientState.beliefDanger ?? 0);
  return clamp01to100(100 - (0.6 * uncontrollability + 0.4 * threat));
}

function inferResistance(patientState: PatientState, difficultyLevel: DifficultyLevel) {
  const positiveBeliefs = clamp01to100(patientState.beliefPositive ?? 0);
  const cas = deriveCas(patientState);

  const base = 0.45 * cas + 0.55 * positiveBeliefs;
  const difficultyBump = difficultyLevel === 1 ? 0 : difficultyLevel === 2 ? 8 : 16;
  return clamp01to100(base + difficultyBump);
}

function inferMetaWorry(patientState: PatientState) {
  // Proxy: uncontrollability belief + positive beliefs about worry.
  const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
  const positiveBeliefs = clamp01to100(patientState.beliefPositive ?? 0);
  return clamp01to100(0.65 * uncontrollability + 0.35 * positiveBeliefs);
}

function isContentCbtLike(interventionType: InterventionType) {
  // In this simulator, these are treated as content-focused / reassurance-adjacent.
  return interventionType === "sokratisk" || interventionType === "verbal";
}

function isProcessMctLike(interventionType: InterventionType) {
  // In this simulator, these are treated as process-focused / MCT-consistent.
  return interventionType === "mindfulness" || interventionType === "eksperiment";
}

function timingPhase(turnIndex: number) {
  if (turnIndex < 2) return "early";
  if (turnIndex < 6) return "mid";
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
  interventionType: InterventionType;
  casBefore: number;
  casAfter: number;
  metaWorryBefore: number;
  flags: {
    contentCbtPenalty: boolean;
    earlyProcessBackfire: boolean;
  };
}) {
  const phase = timingPhase(params.turnIndex);
  const deltaCas = Math.round((params.casAfter - params.casBefore) * 10) / 10;

  const lines: string[] = [];
  lines.push(`System: ${phase} turn • Difficulty ${params.difficultyLevel}`);
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

  const metaWorry = clamp01to100(0.65 * uncontrollability + 0.35 * positive);
  const highMetaWorry = metaWorry >= 65;

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

  const profile = getDifficultyProfile(difficultyLevel);
  const resistance = inferResistance(patientState, difficultyLevel);
  const engagement = inferEngagement(patientState);

  // Difficulty 1: more cooperative, low meta-worry -> slightly easier to engage.
  const engagementBoost = difficultyLevel === 1 ? 10 : 0;

  // Convert to a 0..1 "cooperation" scalar: high resistance reduces effect sizes.
  const cooperation = clamp01to100(engagement + engagementBoost - 0.6 * resistance) / 100;

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
  const drift = profile.casStickiness * 6 * Math.max(0, metaWorryDrive);
  deltaCas += drift;

  // Intervention effects: process vs content.
  if (isProcessMctLike(interventionType)) {
    // Process-focus can reduce CAS, scaled by cooperation and difficulty.
    const base = interventionType === "mindfulness" ? -10 : -9;
    deltaCas += base;
    // Successful process work tends to weaken positive beliefs about worry.
    deltaPositive += interventionType === "mindfulness" ? -2 : -1;
  } else {
    // Content-focus is not rewarded: often increases CAS via rumination/monitoring.
    contentCbtPenalty = difficultyLevel >= 2;
    const base = difficultyLevel === 1 ? +1.5 : profile.contentCbtPenalty;
    deltaCas += base;
    // Content focus can reinforce "worry is useful" especially in level 2-3.
    deltaPositive += difficultyLevel === 1 ? 0 : +2;
  }

  // Timing-sensitive backfire: level 3 early DM/experiment when meta-worry is high.
  const isEarly = timingPhase(turnIndex) === "early";
  const highMetaWorry = metaWorry >= 65;
  if (difficultyLevel === 3 && isEarly && highMetaWorry && isProcessMctLike(interventionType)) {
    earlyProcessBackfire = true;
    // Backfire: they start monitoring/controlling the technique -> CAS spikes and uncontrollability belief rises.
    deltaCas += 18 * profile.earlyProcessBackfireSensitivity;
    // Also temporarily strengthens positive belief about worry/control attempts.
    deltaPositive += 3;
  }

  // Apply gain + cooperation. Key: reward CAS reduction regardless of the "quality" of therapist wording.
  const scale = profile.gain * (0.35 + 0.65 * cooperation);
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
