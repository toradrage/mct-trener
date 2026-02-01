"use client";

import { useMemo } from "react";
import { useSessionStore } from "../../../../../store/sessionStore";
import { MCT_RULES_V1 } from "../../../../../simulator/mctRulesConfig";
import { deriveCas, getTurnPhase, inferEngagement, inferMetaWorry } from "../../../../../simulator/patientSimulator";

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

function delta(a?: number, b?: number) {
  if (typeof a !== "number" || typeof b !== "number") return null;
  return Math.round((b - a) * 10) / 10;
}

export default function DevDebugPanel() {
  const { patientState, interventions, messages, difficultyLevel, llmEnabled, setLlmEnabled } =
    useSessionStore();

  const data = useMemo(() => {
    const cas = deriveCas(patientState);
    const engagementProxy = inferEngagement(patientState);
    const engagementLearned =
      typeof (patientState as any).simEngagement === "number" ? (patientState as any).simEngagement : null;
    const metaWorry = inferMetaWorry(patientState);

    const turnIndex = messages.filter((m) => m.sender === "therapist").length;
    const phase = getTurnPhase(turnIndex);

    const last = interventions[interventions.length - 1];
    const payload = (last?.payload ?? {}) as any;
    const prev = payload?.prevState as any;
    const next = payload?.nextState as any;
    const sim = payload?.sim as any;

    const dU = delta(prev?.beliefUncontrollability, next?.beliefUncontrollability);
    const dT = delta(prev?.beliefDanger, next?.beliefDanger);
    const dP = delta(prev?.beliefPositive, next?.beliefPositive);
    const dE = delta(prev?.simEngagement, next?.simEngagement);

    return {
      cas,
      metaWorry,
      phase,
      turnIndex,
      beliefs: {
        threat: clamp01to100(patientState.beliefDanger ?? 0),
        uncontrollability: clamp01to100(patientState.beliefUncontrollability ?? 0),
        positive: clamp01to100(patientState.beliefPositive ?? 0),
      },
      deltas: {
        cas: typeof sim?.deltaCas === "number" ? Math.round(sim.deltaCas * 10) / 10 : null,
        threat: dT,
        uncontrollability: dU,
        positive: dP,
        engagement: dE,
      },
      engagement: {
        learned: engagementLearned,
        proxy: engagementProxy,
      },
    };
  }, [patientState, interventions, messages]);

  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 2000,
        width: 320,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.35,
        color: "rgba(255,255,255,0.92)",
        background: "rgba(8,10,18,0.78)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        padding: 10,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <strong style={{ fontWeight: 700 }}>DEV: MCT Debug</strong>
        <span style={{ opacity: 0.8 }}>
          D{difficultyLevel} • {data.phase} • t{data.turnIndex}
        </span>
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={llmEnabled}
          onChange={(e) => setLlmEnabled(e.target.checked)}
        />
        <span style={{ opacity: 0.9 }}>LLM paraphrase (A/B)</span>
      </label>

      <div style={{ opacity: 0.85, marginBottom: 8 }}>
        Weights: CAS={MCT_RULES_V1.cas.uncontrollabilityWeight}/{MCT_RULES_V1.cas.threatWeight} •
        Meta={MCT_RULES_V1.metaWorryProxy.uncontrollabilityWeight}/{MCT_RULES_V1.metaWorryProxy.positiveBeliefsWeight}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "4px 10px" }}>
        <Row label="CAS" value={data.cas} delta={data.deltas.cas} />
        <Row label="Threat monitoring" value={data.beliefs.threat} delta={data.deltas.threat} />
        <Row label="Uncontrollability" value={data.beliefs.uncontrollability} delta={data.deltas.uncontrollability} />
        <Row label="Pos meta (worry helpful)" value={data.beliefs.positive} delta={data.deltas.positive} />
        <Row label="Meta-worry (proxy)" value={data.metaWorry} delta={null} />
        <Row
          label="Engagement (learned)"
          value={data.engagement.learned ?? data.engagement.proxy}
          delta={data.deltas.engagement}
        />
      </div>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Goal: reduce CAS (delta negative), not “good answers”.
      </div>
    </div>
  );
}

function Row(props: { label: string; value: number; delta: number | null }) {
  const deltaText = props.delta === null ? "" : props.delta === 0 ? "±0" : props.delta > 0 ? `+${props.delta}` : `${props.delta}`;
  const deltaColor = props.delta === null ? "rgba(255,255,255,0.55)" : props.delta > 0 ? "rgba(255,120,120,0.95)" : "rgba(150,255,190,0.95)";

  return (
    <>
      <div style={{ opacity: 0.85 }}>{props.label}</div>
      <div style={{ textAlign: "right" }}>{Math.round(props.value * 10) / 10}</div>
      <div style={{ textAlign: "right", color: deltaColor }}>{deltaText}</div>
    </>
  );
}
