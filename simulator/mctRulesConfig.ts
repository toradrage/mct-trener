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
    processDeltaThreat: Record<InterventionType, number>; // only used for process-like types
    processDeltaUncontrollability: Record<InterventionType, number>; // only used for process-like types
    processDeltaPositive: Record<InterventionType, number>; // only used for process-like types
    contentLevel1: {
      deltaThreat: number;
      deltaUncontrollability: number;
      deltaPositive: number;
    };
    contentLevel2plus: {
      deltaThreat: number;
      deltaUncontrollability: number;
      deltaPositive: number;
    };
  };
  drift: {
    baseMultiplier: number;
    uncontrollabilityWeight: number;
    threatWeight: number;
  };
  backfire: {
    level3: {
      earlyPhaseOnly: boolean;
      requiredHighMetaWorry: boolean;
      // Always hits at least two state variables (U + T, plus often positive beliefs).
      deltaUncontrollability: number;
      deltaThreat: number;
      deltaPositive: number;
    };
  };
  engagementLearning: {
    // Store engagement as a learned state in patientState (not purely inferred each turn).
    initialFromProxyWeight: number; // 0..1 blend between proxy and profile baseline
    profileBaselineByDifficulty: Record<DifficultyLevel, number>;
    casDeltaEmaAlpha: number; // 0..1
    rewardPerNegativeCasEma: number; // engagement increase per -1 CAS EMA
    penaltyPerPositiveCasEma: number; // engagement decrease per +1 CAS EMA
    min: number;
    max: number;
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

    processDeltaThreat: {
      sokratisk: 0,
      verbal: 0,
      mindfulness: -3,
      eksperiment: -7,
    },
    processDeltaUncontrollability: {
      sokratisk: 0,
      verbal: 0,
      mindfulness: -10,
      eksperiment: -6,
    },
    processDeltaPositive: {
      sokratisk: 0,
      verbal: 0,
      mindfulness: -2,
      eksperiment: -1,
    },

    contentLevel1: {
      deltaThreat: 1,
      deltaUncontrollability: 0.5,
      deltaPositive: 0,
    },
    contentLevel2plus: {
      deltaThreat: 8,
      deltaUncontrollability: 4,
      deltaPositive: 2,
    },
  },

  drift: {
    // Higher => more CAS drift upwards when meta-worry is high.
    baseMultiplier: 6,
    uncontrollabilityWeight: 0.7,
    threatWeight: 0.3,
  },

  backfire: {
    level3: {
      earlyPhaseOnly: true,
      requiredHighMetaWorry: true,
      // The raw deltas are further scaled by overall gain/cooperation.
      deltaUncontrollability: 16,
      deltaThreat: 8,
      deltaPositive: 4,
    },
  },

  engagementLearning: {
    initialFromProxyWeight: 0.8,
    profileBaselineByDifficulty: {
      1: 55,
      2: 45,
      3: 40,
    },
    casDeltaEmaAlpha: 0.35,
    rewardPerNegativeCasEma: 1.6,
    penaltyPerPositiveCasEma: 1.2,
    min: 10,
    max: 90,
  },

  difficultyProfiles: {
    1: {
      id: 1,
      label: "Nivå 1 (samarbeidende / lav meta-worry)",
      engagementBoost: 0,
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
