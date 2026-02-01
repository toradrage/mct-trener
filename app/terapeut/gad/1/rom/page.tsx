"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../../../../../store/sessionStore";
import {
  getTurnPhase,
  getFormulationProgress,
  getSessionPhase,
  simulateGadPatientTurn,
  type FormulationKey,
  type InterventionType,
} from "../../../../../simulator/patientSimulator";
import DevDebugPanel from "./DevDebugPanel";
import TherapyRoomHUD from "./TherapyRoomHUD";
import TherapyRoomScene from "./TherapyRoomScene";

const INTERVENTIONS: Array<{ id: InterventionType; label: string }> = [
  { id: "sokratisk", label: "Sokratiske spørsmål" },
  { id: "eksperiment", label: "Eksperiment" },
  { id: "mindfulness", label: "Mindfulness" },
  { id: "verbal", label: "Verbal reattribusjon" },
];

const FORMULATION_QUESTIONS: Array<{ id: FormulationKey; label: string }> = [
  { id: "triggers", label: "Trigger (hva/når)" },
  { id: "whatIfThought", label: "Første «hva hvis»" },
  { id: "worryChain", label: "Bekymringskjede" },
  { id: "emotions", label: "Følelser/kropp" },
  { id: "positiveMetaBelief", label: "+ Meta (hjelper?)" },
  { id: "negativeMetaBelief", label: "- Meta (farlig/ukontroll?)" },
  { id: "casStrategy", label: "CAS-respons (hva gjør du?)" },
];

function clamp01to100(n: number) {
  return Math.max(0, Math.min(100, n));
}

function pickAvatarSrc(avatarProfile: string) {
  if (avatarProfile?.includes("2")) return "/avatar2.png";
  if (avatarProfile?.includes("3")) return "/avatar3.png";
  return "/avatar1.png";
}

export default function Terapirom() {
  const router = useRouter();

  const {
    difficultyLevel,
    avatarProfile,
    messages,
    llmEnabled,
    addMessage,
    addIntervention,
    patientState,
    setPatientState,
    sessionStatus,
    setSessionStatus,
  } = useSessionStore();

  const [melding, setMelding] = useState("");
  const [interventionType, setInterventionType] = useState<InterventionType | null>(null);
  const [formulationKey, setFormulationKey] = useState<FormulationKey | null>(null);
  const [visPasientSvar, setVisPasientSvar] = useState(false);
  const [pasientSvar, setPasientSvar] = useState<string>("");

  const uiTurnIndex = useMemo(
    () => messages.filter((m) => m.sender === "therapist").length,
    [messages],
  );
  const uiPhase = useMemo(
    () => getSessionPhase(uiTurnIndex, patientState),
    [uiTurnIndex, patientState],
  );

  useEffect(() => {
    if (sessionStatus === "not-started") setSessionStatus("in-progress");
  }, [sessionStatus, setSessionStatus]);

  const avatarSrc = useMemo(() => pickAvatarSrc(avatarProfile), [avatarProfile]);

  const metrics = useMemo(() => {
    const uncontrollability = clamp01to100(patientState.beliefUncontrollability ?? 0);
    const threat = clamp01to100(patientState.beliefDanger ?? 0);
    const cas = clamp01to100(0.55 * uncontrollability + 0.45 * threat);

    return [
      { label: "CAS", value: cas },
      { label: "Trusselmonitorering", value: threat },
      { label: "Tro på ukontrollerbarhet", value: uncontrollability },
    ] as const;
  }, [patientState]);

  function handleExit() {
    setSessionStatus("finished");
    router.push("/terapeut/gad/1/rom/review");
  }

  async function tryParaphraseWithLlm(params: {
    rulesReply: string;
    systemFeedback: string;
    phase: "formulation" | "early" | "mid" | "late";
    interventionType: InterventionType;
    patientState: {
      beliefUncontrollability: number;
      beliefDanger: number;
      beliefPositive: number;
      simEngagement?: number;
      simCasDeltaEma?: number;
    };
  }): Promise<string | null> {
    // Keep UX snappy: if LLM doesn't respond fast, fall back to rules text.
    const budgetMs = 300;

    try {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), budgetMs);

      const res = await fetch("/api/llm/paraphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rulesReply: params.rulesReply,
          systemFeedback: params.systemFeedback,
          phase: params.phase,
          interventionType: params.interventionType,
          difficultyLevel,
          patientState: params.patientState,
        }),
        signal: controller.signal,
      });

      window.clearTimeout(t);

      if (!res.ok) return null;
      const json = (await res.json()) as any;
      const reply = typeof json?.reply === "string" ? json.reply.trim() : "";
      return json?.ok && reply ? reply : null;
    } catch {
      return null;
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (uiPhase === "formulation") {
      if (!formulationKey) return;
    } else {
      if (!interventionType) return;
    }

    const text = melding.trim();
    if (!text) return;

    const now = Date.now();
    const turnIndex = messages.filter((m) => m.sender === "therapist").length;
    const phase = getSessionPhase(turnIndex, patientState);

    const sim = simulateGadPatientTurn({
      disorder: "GAD",
      difficultyLevel,
      interventionType: interventionType ?? "verbal",
      therapistText: text,
      patientState,
      turnIndex,
      formulationSelectedKey: uiPhase === "formulation" ? formulationKey : null,
    });
    const nextState = { ...patientState, ...sim.nextPatientState };

    addMessage({
      sender: "therapist",
      text,
      timestamp: now,
      interventionType: uiPhase === "formulation" ? `formulation:${formulationKey}` : interventionType ?? undefined,
    });
    addIntervention({
      type: uiPhase === "formulation" ? `formulation:${formulationKey}` : (interventionType ?? "verbal"),
      payload: {
        text,
        sim: sim.signals,
        systemFeedback: sim.systemFeedback,
        prevState: patientState,
        nextState,
      },
      timestamp: now,
    });
    setPatientState(nextState);

    setMelding("");

    if (uiPhase === "formulation") {
      // Keep selection so the therapist can continue the same category if desired.
    }

    // Always show something immediately (rules reply), then optionally swap to LLM paraphrase.
    const rulesReply = sim.patientReply;
    setPasientSvar(rulesReply);
    setVisPasientSvar(true);

    const paraphrasePromise =
      llmEnabled
        ? tryParaphraseWithLlm({
            rulesReply,
            systemFeedback: sim.systemFeedback,
            phase,
            interventionType: (interventionType ?? "verbal"),
            patientState: {
              beliefUncontrollability: nextState.beliefUncontrollability,
              beliefDanger: nextState.beliefDanger,
              beliefPositive: nextState.beliefPositive,
              simEngagement: (nextState as any).simEngagement,
              simCasDeltaEma: (nextState as any).simCasDeltaEma,
            },
          })
        : Promise.resolve(null);

    // Ensure we never have "silent turns": push exactly one patient message every time.
    window.setTimeout(async () => {
      const paraphrased = await paraphrasePromise;
      const finalReply = paraphrased ?? rulesReply;

      // Update the speech bubble to match what we push to the chat log.
      setPasientSvar(finalReply);

      addMessage({ sender: "patient", text: finalReply, timestamp: Date.now() });
    }, 350);

    window.setTimeout(() => {
      setVisPasientSvar(false);
    }, 4600);
  }

  return (
    <main className="root">
      <TherapyRoomScene avatarSrc={avatarSrc} showSpeech={visPasientSvar} speechText={pasientSvar} />

      <DevDebugPanel />

      <TherapyRoomHUD
        scenarioLabel={(() => {
          if (uiPhase === "formulation") {
            const fp = getFormulationProgress(patientState);
            return `Fase 1: Kartlegging (GAD) • ${fp.done}/${fp.total}`;
          }
          return `Fase 2: Intervensjon (GAD) • ${uiPhase}`;
        })()}
        onExit={handleExit}
        metrics={metrics}
        messages={messages}
        interventions={uiPhase === "formulation" ? (FORMULATION_QUESTIONS as any) : (INTERVENTIONS as any)}
        selectedIntervention={uiPhase === "formulation" ? (formulationKey as any) : (interventionType as any)}
        onSelectIntervention={uiPhase === "formulation" ? (setFormulationKey as any) : (setInterventionType as any)}
        message={melding}
        onChangeMessage={setMelding}
        onSubmit={handleSend}
        sendDisabled={uiPhase === "formulation" ? !formulationKey : !interventionType}
        moveSectionLabel={uiPhase === "formulation" ? "Kartleggingsspørsmål" : "Intervensjoner"}
      />

      <style jsx>{`
        .root {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #050816;
        }
      `}</style>
    </main>
  );
}
