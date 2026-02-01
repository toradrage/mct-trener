"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../../../../../store/sessionStore";
import {
  simulateGadPatientTurn,
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
    addMessage,
    addIntervention,
    patientState,
    setPatientState,
    sessionStatus,
    setSessionStatus,
  } = useSessionStore();

  const [melding, setMelding] = useState("");
  const [interventionType, setInterventionType] = useState<InterventionType | null>(null);
  const [visPasientSvar, setVisPasientSvar] = useState(false);
  const [pasientSvar, setPasientSvar] = useState<string>("");

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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!interventionType) return;

    const text = melding.trim();
    if (!text) return;

    const now = Date.now();
    const turnIndex = messages.filter((m) => m.sender === "therapist").length;

    const sim = simulateGadPatientTurn({
      disorder: "GAD",
      difficultyLevel,
      interventionType,
      therapistText: text,
      patientState,
      turnIndex,
    });
    const nextState = { ...patientState, ...sim.nextPatientState };

    addMessage({
      sender: "therapist",
      text,
      timestamp: now,
      interventionType,
    });
    addIntervention({
      type: interventionType,
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

    const reply = sim.patientReply;
    setPasientSvar(reply);
    setVisPasientSvar(true);

    window.setTimeout(() => {
      addMessage({ sender: "patient", text: reply, timestamp: Date.now() });
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
        scenarioLabel="Scenario: GAD – nivå 1"
        onExit={handleExit}
        metrics={metrics}
        interventions={INTERVENTIONS}
        selectedIntervention={interventionType}
        onSelectIntervention={setInterventionType}
        message={melding}
        onChangeMessage={setMelding}
        onSubmit={handleSend}
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
