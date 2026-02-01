import type { DifficultyLevel } from "../store/sessionStore";
import type { InterventionType } from "./patientSimulator";

export type Phase = "early" | "mid" | "late";

export type MctDifficultyProfile = {
  id: DifficultyLevel;
  label: string;
  engagementBoost: number; // 0-100 additive boost before cooperation calc
  // Baseline tendency to return to higher CAS between turns ("stickiness").
  casStickiness: number;
  // How much content-focus tends to increase CAS.
  contentCbtPenalty: number;
  // How sensitive the patient is to early process interventions (DM/experiment) when meta-worry is high.
  earlyProcessBackfireSensitivity: number;
  // Global gain multiplier (lower = less therapeutic movement).
  gain: number;
};

export type MctRulesConfig = {
  phase: {
    earlyMaxTurnExclusive: number;
    midMaxTurnExclusive: number;
  };
  cas: {
    uncontrollabilityWeight: number;
    threatWeight: number;
  };
  metaWorryProxy: {
    uncontrollabilityWeight: number;
    positiveBeliefsWeight: number;
    highThreshold: number;
  };
  engagementProxy: {
    uncontrollabilityWeight: number;
    threatWeight: number;
  };
  resistanceProxy: {
    casWeight: number;
    positiveBeliefsWeight: number;
    difficultyBump: Record<DifficultyLevel, number>;
  };
  cooperation: {
    resistanceWeight: number;
    minScale: number;
    maxScale: number;
  };
  interventions: {
    contentCbtLike: ReadonlyArray<InterventionType>;
    processMctLike: ReadonlyArray<InterventionType>;
    processDeltaCas: Record<InterventionType, number>; // only used for process-like types
    processDeltaPositive: Record<InterventionType, number>; // only used for process-like types
    contentLevel1DeltaCas: number;
    contentDeltaPositive: number;
  };
  drift: {
    baseMultiplier: number;
  };
  backfire: {
    level3: {
      earlyPhaseOnly: boolean;
      requiredHighMetaWorry: boolean;
      extraDeltaCas: number;
      extraDeltaPositive: number;
    };
  };
  difficultyProfiles: Record<DifficultyLevel, MctDifficultyProfile>;
};

export const MCT_RULES_V1: MctRulesConfig = {
  phase: {
    earlyMaxTurnExclusive: 2,
    midMaxTurnExclusive: 6,
  },

  cas: {
    uncontrollabilityWeight: 0.55,
    threatWeight: 0.45,
  },

  metaWorryProxy: {
    uncontrollabilityWeight: 0.65,
    positiveBeliefsWeight: 0.35,
    highThreshold: 65,
  },

  engagementProxy: {
    uncontrollabilityWeight: 0.6,
    threatWeight: 0.4,
  },

  resistanceProxy: {
    casWeight: 0.45,
    positiveBeliefsWeight: 0.55,
    difficultyBump: {
      1: 0,
      2: 8,
      3: 16,
    },
  },

  cooperation: {
    resistanceWeight: 0.6,
    minScale: 0.35,
    maxScale: 0.65,
  },

  interventions: {
    contentCbtLike: ["sokratisk", "verbal"],
    processMctLike: ["mindfulness", "eksperiment"],

    // CAS deltas here are applied as "direct CAS delta" (affects U+T equally).
    processDeltaCas: {
      sokratisk: 0,
      verbal: 0,
      mindfulness: -10,
      eksperiment: -9,
    },
    processDeltaPositive: {
      sokratisk: 0,
      verbal: 0,
      mindfulness: -2,
      eksperiment: -1,
    },

    // Content-focus tends to increase CAS (more monitoring/rumination).
    contentLevel1DeltaCas: 1.5,
    contentDeltaPositive: 2,
  },

  drift: {
    // Higher => more CAS drift upwards when meta-worry is high.
    baseMultiplier: 6,
  },

  backfire: {
    level3: {
      earlyPhaseOnly: true,
      requiredHighMetaWorry: true,
      // The raw extra delta is further scaled by difficulty profile sensitivity and overall scale.
      extraDeltaCas: 18,
      extraDeltaPositive: 3,
    },
  },

  difficultyProfiles: {
    1: {
      id: 1,
      label: "Nivå 1 (samarbeidende / lav meta-worry)",
      engagementBoost: 10,
      casStickiness: 0.15,
      contentCbtPenalty: 2,
      earlyProcessBackfireSensitivity: 0.15,
      gain: 1,
    },
    2: {
      id: 2,
      label: "Nivå 2 (fastlåst CAS / ruminerer lett)",
      engagementBoost: 0,
      casStickiness: 0.35,
      contentCbtPenalty: 8,
      earlyProcessBackfireSensitivity: 0.35,
      gain: 0.7,
    },
    3: {
      id: 3,
      label: "Nivå 3 (høy meta-worry / tidlig backfire)",
      engagementBoost: 0,
      casStickiness: 0.55,
      contentCbtPenalty: 12,
      earlyProcessBackfireSensitivity: 0.7,
      gain: 0.55,
    },
  },
};
