import type { DifficultyLevel, PatientState } from "../store/sessionStore";

export type InterventionType = "sokratisk" | "eksperiment" | "mindfulness" | "verbal";

export type PatientTurnInput = {
  disorder: "GAD";
  difficultyLevel: DifficultyLevel;
  interventionType: InterventionType;
  therapistText: string;
  patientState: PatientState;
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
  return difficultyLevel === 1 ? 1 : difficultyLevel === 2 ? 0.7 : 0.45;
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

function pickReply(params: {
  interventionType: InterventionType;
  difficultyLevel: DifficultyLevel;
  patientState: PatientState;
  nextState: Partial<PatientState>;
  therapistText: string;
}) {
  const { interventionType, difficultyLevel, patientState, nextState } = params;

  const threat = clamp01to100((nextState.beliefDanger ?? patientState.beliefDanger) ?? 0);
  const uncontrollability = clamp01to100(
    (nextState.beliefUncontrollability ?? patientState.beliefUncontrollability) ?? 0,
  );
  const positive = clamp01to100((nextState.beliefPositive ?? patientState.beliefPositive) ?? 0);

  const highThreat = threat >= 65;
  const highUncontrol = uncontrollability >= 65;
  const highPositive = positive >= 55;

  const suffixByDifficulty: Record<DifficultyLevel, string> = {
    1: "",
    2: " Jeg kjenner litt motstand.",
    3: " Det trigger meg ganske mye akkurat nå.",
  };

  if (interventionType === "mindfulness") {
    if (highUncontrol) {
      return (
        "Når jeg prøver å la tankene bare være der, så dras jeg fortsatt inn… men jeg merker et lite mellomrom." +
        suffixByDifficulty[difficultyLevel]
      );
    }
    return (
      "Det var uvant, men jeg klarte litt mer å observere tankene uten å følge dem." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "eksperiment") {
    if (highThreat) {
      return (
        "Jeg kan prøve et lite eksperiment… men jeg er redd det vil bekrefte at noe galt skjer." +
        suffixByDifficulty[difficultyLevel]
      );
    }
    return (
      "Ok, jeg kan teste det. Kanskje jeg kan tåle ubehaget litt lenger enn jeg tror." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  if (interventionType === "sokratisk") {
    if (highThreat) {
      return (
        "Jeg skjønner spørsmålet… men for meg kjennes faren veldig reell. Hva om det faktisk skjer?" +
        suffixByDifficulty[difficultyLevel]
      );
    }
    return (
      "Når jeg sier det høyt, virker det litt mindre sikkert enn jeg trodde. Kanskje jeg overdriver sannsynligheten." +
      suffixByDifficulty[difficultyLevel]
    );
  }

  // verbal
  if (highPositive) {
    return (
      "En del av meg tror fortsatt at bekymring hjelper… det føles risikabelt å gi slipp." +
      suffixByDifficulty[difficultyLevel]
    );
  }
  return (
    "Det gir mening. Kanskje bekymringen ikke beskytter meg så mye som jeg har trodd." +
    suffixByDifficulty[difficultyLevel]
  );
}

export function simulateGadPatientTurn(input: PatientTurnInput): PatientTurnOutput {
  const { difficultyLevel, interventionType, patientState } = input;

  const factor = difficultyFactor(difficultyLevel);
  const resistance = inferResistance(patientState, difficultyLevel);
  const engagement = inferEngagement(patientState);

  // Convert to a 0..1 "cooperation" scalar: high resistance reduces effect sizes.
  const cooperation = clamp01to100(engagement - 0.6 * resistance) / 100;

  // Base deltas (tuned to feel plausible, not clinically perfect).
  let deltaUncontrol = 0;
  let deltaThreat = 0;
  let deltaPositive = 0;

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
