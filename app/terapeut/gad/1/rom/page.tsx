"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSessionStore } from "../../../../../store/sessionStore";
import TherapyRoomHUD from "./TherapyRoomHUD";
import TherapyRoomScene from "./TherapyRoomScene";

type InterventionType = "sokratisk" | "eksperiment" | "mindfulness" | "verbal";

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

function generatePatientReply(
  interventionType: InterventionType,
  difficultyLevel: 1 | 2 | 3,
) {
  const baseByType: Record<InterventionType, string> = {
    sokratisk:
      "Jeg skjønner… men jeg får en følelse av at dette kan gå galt. Hva om jeg ikke klarer å stoppe bekymringen?",
    eksperiment:
      "Jeg kan prøve… men jeg er redd det blir verre hvis jeg slipper taket.",
    mindfulness:
      "Det føles litt uvant, men jeg kan legge merke til tankene uten å følge dem.",
    verbal:
      "Kanskje det finnes en annen forklaring… men det føles fortsatt veldig ekte.",
  };

  const resistanceByDifficulty: Record<1 | 2 | 3, string> = {
    1: "",
    2: " Jeg er litt usikker.",
    3: " Jeg kjenner motstand… dette er vanskelig.",
  };

  return `${baseByType[interventionType]}${resistanceByDifficulty[difficultyLevel]}`;
}

export default function Terapirom() {
  const router = useRouter();

  const {
    difficultyLevel,
    avatarProfile,
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

  function applyInterventionEffects(type: InterventionType) {
    const factor = difficultyLevel === 1 ? 1 : difficultyLevel === 2 ? 0.7 : 0.45;

    const next = { ...patientState };
    if (type === "mindfulness") {
      next.beliefUncontrollability = clamp01to100(next.beliefUncontrollability - 6 * factor);
    }
    if (type === "sokratisk") {
      next.beliefDanger = clamp01to100(next.beliefDanger - 5 * factor);
    }
    if (type === "eksperiment") {
      next.beliefDanger = clamp01to100(next.beliefDanger - 4 * factor);
      next.beliefUncontrollability = clamp01to100(next.beliefUncontrollability - 3 * factor);
    }
    if (type === "verbal") {
      next.beliefPositive = clamp01to100(next.beliefPositive - 4 * factor);
    }

    setPatientState(next);
  }

  function handleExit() {
    setSessionStatus("finished");
    router.push("/terapeut/gad/1/rom/review");
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!interventionType) return;

    const text = melding.trim();
    if (!text) return;

    addMessage({
      sender: "therapist",
      text,
      timestamp: Date.now(),
      interventionType,
    });
    addIntervention({ type: interventionType, payload: { text }, timestamp: Date.now() });
    applyInterventionEffects(interventionType);

    setMelding("");

    const reply = generatePatientReply(interventionType, difficultyLevel);
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
