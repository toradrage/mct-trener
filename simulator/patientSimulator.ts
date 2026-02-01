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
  signals: {
    resistance: number; // 0-100
    engagement: number; // 0-100
    cas: number; // 0-100 (derived)
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

function difficultyFactor(difficultyLevel: DifficultyLevel) {
  // Higher difficulty -> smaller therapeutic gain + more resistance
  return difficultyLevel === 1 ? 1 : difficultyLevel === 2 ? 0.55 : 0.35;
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

function pickReply(params: {
  interventionType: InterventionType;
  difficultyLevel: DifficultyLevel;
  patientState: PatientState;
  nextState: Partial<PatientState>;
  therapistText: string;
  turnIndex?: number;
  flags: {
    contentCbtSpiral: boolean;
    earlyBackfire: boolean;
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

  if (flags.earlyBackfire) {
    if (interventionType === "eksperiment") {
      return (
        "Når jeg prøver å " +
        "slippe taket" +
        ", blir jeg plutselig redd for at jeg ikke klarer å stoppe bekymringen i det hele tatt. " +
        "Da begynner jeg å overvåke meg selv mer, og det øker bare trykket." +
        suffixByDifficulty[difficultyLevel]
      );
    }

    // reassurance-style backfire
    return (
      "Når vi leter etter en betryggende forklaring, får jeg et kort pust… " +
      "men så begynner jeg å sjekke om jeg virkelig er rolig. " +
      "Da føles bekymringen enda mer ukontrollerbar." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (flags.contentCbtSpiral) {
    return (
      "Når vi går inn i innholdet, merker jeg at jeg begynner å analysere og sammenligne " +
      "hele tiden. Det blir mer grubling, og jeg ender med å følge bekymringen tettere." +
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
  const isEarly = turnIndex < 2;

  const factor = difficultyFactor(difficultyLevel);
  const resistance = inferResistance(patientState, difficultyLevel);
  const engagement = inferEngagement(patientState);

  // Difficulty 1: more cooperative, low meta-worry -> slightly easier to engage.
  const engagementBoost = difficultyLevel === 1 ? 10 : 0;

  // Convert to a 0..1 "cooperation" scalar: high resistance reduces effect sizes.
  const cooperation = clamp01to100(engagement + engagementBoost - 0.6 * resistance) / 100;

  const metaWorry = inferMetaWorry(patientState);

  // Base deltas (tuned to feel plausible, not clinically perfect).
  let deltaUncontrol = 0;
  let deltaThreat = 0;
  let deltaPositive = 0;

  let contentCbtSpiral = false;
  let earlyBackfire = false;

  switch (interventionType) {
    case "mindfulness":
      deltaUncontrol -= 10;
      deltaThreat -= 3;
      break;
    case "eksperiment":
      deltaThreat -= 9;
      deltaUncontrol -= 6;
      break;
    case "sokratisk":
      deltaThreat -= 8;
      deltaPositive -= 2;
      break;
    case "verbal":
      deltaPositive -= 10;
      // If threat is high, reattribution can feel invalidating early.
      if ((patientState.beliefDanger ?? 0) >= 70) deltaThreat += 2;
      break;
  }

  // Difficulty-specific dynamics (GAD): focus on CAS + metacognitions.
  if (difficultyLevel === 2) {
    // Level 2: more stuck CAS; content-focused work often increases rumination.
    // Here we treat sokratisk/verbal as more content/"reassurance"-like.
    if (interventionType === "sokratisk" || interventionType === "verbal") {
      contentCbtSpiral = true;
      deltaThreat += 7;
      deltaUncontrol += 5;
      deltaPositive += 2;
    }
  }

  if (difficultyLevel === 3) {
    // Level 3: high meta-worry; early experiments or reassurance can backfire.
    const highMetaWorry = metaWorry >= 65;
    if (isEarly && highMetaWorry && (interventionType === "eksperiment" || interventionType === "verbal")) {
      earlyBackfire = true;
      deltaUncontrol += 18;
      deltaThreat += 7;
      deltaPositive += 4;
    }
  }

  // Level 1: wrong intervention should have small negative effect.
  if (difficultyLevel === 1) {
    if (interventionType === "verbal" && (patientState.beliefDanger ?? 0) >= 70) {
      deltaThreat += 1;
    }
  }

  // Apply difficulty + cooperation
  const scale = factor * (0.35 + 0.65 * cooperation);

  const nextBeliefUncontrollability = clamp01to100(
    (patientState.beliefUncontrollability ?? 0) + deltaUncontrol * scale,
  );
  const nextBeliefDanger = clamp01to100((patientState.beliefDanger ?? 0) + deltaThreat * scale);
  const nextBeliefPositive = clamp01to100((patientState.beliefPositive ?? 0) + deltaPositive * scale);

  const nextPatientState: Partial<PatientState> = {
    beliefUncontrollability: nextBeliefUncontrollability,
    beliefDanger: nextBeliefDanger,
    beliefPositive: nextBeliefPositive,
  };

  const cas = deriveCas({
    ...patientState,
    ...nextPatientState,
  });

  const patientReply = pickReply({
    interventionType,
    difficultyLevel,
    patientState,
    nextState: nextPatientState,
    therapistText: input.therapistText,
    turnIndex,
    flags: {
      contentCbtSpiral,
      earlyBackfire,
    },
  });

  return {
    nextPatientState,
    patientReply,
    signals: {
      resistance: clamp01to100(resistance),
      engagement: clamp01to100(engagement),
      cas,
    },
  };
}
