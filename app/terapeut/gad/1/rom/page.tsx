"use client";
import { useState } from "react";
import { useSessionStore } from "../../../../../store/sessionStore";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Terapirom() {

  const [melding, setMelding] = useState("");
  const [visPasientSvar, setVisPasientSvar] = useState(false);
  const [pasientSvar, setPasientSvar] = useState("");
  const [interventionType, setInterventionType] = useState<string | undefined>(undefined);

  const addMessage = useSessionStore((s: any) => s.addMessage);
  const addIntervention = useSessionStore((s: any) => s.addIntervention);
  const setPatientState = useSessionStore((s: any) => s.setPatientState);
  const setSessionStatus = useSessionStore((s: any) => s.setSessionStatus);
  const session = useSessionStore();
  const router = useRouter();

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interventionType) return;
    // Lagre terapeutens melding med interventionType
    addMessage({ sender: "therapist", text: melding, timestamp: Date.now(), interventionType });
    addIntervention({ type: interventionType, payload: { message: melding }, timestamp: Date.now() });

    // Hardkodede regler for oppdatering av patientState
    let newDistress = session.patientState.beliefUncontrollability;
    let newAlliance = session.patientState.mood === 'alliance' ? 100 : 80;
    let svar = "";
    // Vanskelighetsgrad påvirker hvor mye distress reduseres
    let distressChange = 0;
    let allianceChange = 0;
    if (interventionType === "sokratisk") {
      distressChange = -5 + (session.difficultyLevel - 1) * 2;
      svar = "Det hjalp litt, jeg føler meg litt roligere.";
    } else if (interventionType === "eksperiment") {
      distressChange = -3 + (session.difficultyLevel - 1) * 2;
      svar = "Det var interessant, men jeg er fortsatt litt usikker.";
    } else if (interventionType === "mindfulness") {
      distressChange = -2;
      svar = "Jeg klarte å roe meg litt ned.";
    } else if (interventionType === "verbal") {
      allianceChange = -3;
      svar = "Jeg føler meg litt misforstått nå.";
    } else {
      svar = "Takk for at du prøver å hjelpe, men jeg er fortsatt ganske bekymret.";
    }
    newDistress = Math.max(0, Math.min(100, newDistress + distressChange));
    newAlliance = Math.max(0, Math.min(100, newAlliance + allianceChange));
    setPatientState({ beliefUncontrollability: newDistress, mood: newAlliance });
    setPasientSvar(svar);
    // Lagre pasientsvar
    addMessage({ sender: "patient", text: svar, timestamp: Date.now(), interventionType });
    setVisPasientSvar(true);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-green-100 p-0">
      {/* Scene-container med depth */}
      <div className="relative flex flex-col items-center justify-center w-full h-full min-h-screen" style={{ perspective: '1200px' }}>
        {/* Bakgrunn (rom) */}
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-end pointer-events-none">
          <div className="w-full h-2/3 bg-gradient-to-t from-green-200 to-blue-50 rounded-b-3xl flex items-end justify-center relative">
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-12 bg-green-100 rounded-full blur-2xl opacity-40" />
          </div>
        </div>

        {/* Scene (pasient) på eget plan */}
        <div
          className="relative z-10 flex flex-col items-center w-[260px] h-[320px] mt-16 group"
          style={{ transform: 'translateZ(0px) rotateX(6deg)', boxShadow: '0 8px 32px 0 rgba(31,38,135,0.10)' }}
        >
          {/* Spotlight bak hodet */}
          <div
            className="absolute left-1/2 top-[80px] -translate-x-1/2 w-40 h-24 rounded-full"
            style={{
              background: 'radial-gradient(circle, #fffbe6 0%, #fef9c3 60%, transparent 100%)',
              filter: 'blur(16px)',
              opacity: 0.7,
              zIndex: 2,
            }}
          />
          {/* Avatar med blink */}
          <div
            className="relative mt-12 animate-blink"
            style={{ zIndex: 3 }}
          >
            <Image
              src="/avatar1.png"
              alt="Pasient smilende"
              width={180}
              height={220}
              className="rounded-xl border-4 border-blue-200 shadow-xl bg-white"
              style={{ boxShadow: '0 8px 32px 0 rgba(31,38,135,0.18)' }}
            />
            {/* Drop shadow under avatar */}
            <div
              className="absolute left-1/2 top-[210px] -translate-x-1/2 w-32 h-7 rounded-full"
              style={{
                background: 'radial-gradient(ellipse at center, #b6bbc7 0%, #e0e7ef 80%, transparent 100%)',
                filter: 'blur(2px)',
                opacity: 0.5,
                zIndex: 2,
              }}
            />
          </div>
          {/* Stol/omriss bak avatar (enkel illustrasjon) */}
          <div className="absolute left-1/2 top-[220px] -translate-x-1/2 w-36 h-16 bg-gradient-to-t from-gray-300 to-gray-100 rounded-b-2xl opacity-60 z-0" />
          {/* Snakkeboble fra pasient */}
          {visPasientSvar && (
            <div className="mt-4 bg-gray-100 border border-gray-300 rounded-xl px-4 py-2 text-gray-800 shadow text-lg max-w-xs z-10">
              {pasientSvar}
            </div>
          )}
        </div>

        {/* Kontrollpanel (terapeut) på eget plan foran */}
        <div
          className="relative z-20 w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center mt-8"
          style={{ transform: 'translateZ(120px)' }}
        >
          {!visPasientSvar && (
            <form onSubmit={handleSend} className="w-full flex flex-col items-center gap-4">
              <label htmlFor="intervention" className="text-gray-700 font-medium">Velg intervensjon:</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  className={`interv-btn ${interventionType === 'sokratisk' ? 'active bg-blue-500 text-white border-blue-500' : 'bg-white text-blue-700 border-blue-300'}`}
                  onClick={() => setInterventionType('sokratisk')}
                >Sokratiske spørsmål</button>
                <button
                  type="button"
                  className={`interv-btn ${interventionType === 'eksperiment' ? 'active bg-purple-500 text-white border-purple-500' : 'bg-white text-purple-700 border-purple-300'}`}
                  onClick={() => setInterventionType('eksperiment')}
                >Eksperiment</button>
                <button
                  type="button"
                  className={`interv-btn ${interventionType === 'mindfulness' ? 'active bg-green-500 text-white border-green-500' : 'bg-white text-green-700 border-green-300'}`}
                  onClick={() => setInterventionType('mindfulness')}
                >Mindfulness</button>
                <button
                  type="button"
                  className={`interv-btn ${interventionType === 'verbal' ? 'active bg-yellow-500 text-white border-yellow-500' : 'bg-white text-yellow-700 border-yellow-300'}`}
                  onClick={() => setInterventionType('verbal')}
                >Verbal reattribusjon</button>
              </div>
              <label htmlFor="melding" className="mb-2 text-gray-700 font-medium mt-4">Skriv til pasienten:</label>
              <input
                id="melding"
                type="text"
                value={melding}
                onChange={e => setMelding(e.target.value)}
                className="w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Velkommen, hva kan jeg hjelpe deg med i dag?"
                required
              />
              <button
                type="submit"
                className="mt-2 px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition"
                disabled={!interventionType}
              >
                Send
              </button>
            </form>
          )}
          {/* Avslutt økt-knapp */}
          <button
            onClick={() => {
              setSessionStatus('finished');
              router.push("/terapeut/gad/1/rom/review");
            }}
            className="mt-8 px-6 py-2 bg-pink-500 text-white rounded-lg font-semibold hover:bg-pink-600 transition shadow"
          >
            Avslutt økt
          </button>
        </div>
      </div>
      <style jsx>{`
                .interv-btn {
                  min-width: 120px;
                  min-height: 48px;
                  padding: 0 1.5rem;
                  border-radius: 9999px;
                  font-weight: 600;
                  font-size: 1rem;
                  border-width: 2px;
                  box-shadow: 0 2px 8px 0 rgba(31,38,135,0.10);
                  transition: box-shadow 0.2s, transform 0.15s, background 0.2s, color 0.2s;
                }
                .interv-btn:hover {
                  transform: translateY(-2px) scale(1.03);
                  box-shadow: 0 6px 18px 0 rgba(31,38,135,0.18);
                  z-index: 1;
                }
                .interv-btn:active {
                  transform: translateY(2px) scale(0.98);
                  box-shadow: 0 1px 4px 0 rgba(31,38,135,0.10);
                }
                .interv-btn.active {
                  box-shadow: 0 8px 24px 0 rgba(31,38,135,0.22);
                  outline: 2px solid #6366f1;
                }
        @keyframes blink {
          0%, 97%, 100% { opacity: 1; }
          98%, 99% { opacity: 0.2; }
        }
        .animate-blink {
          animation: blink 4s infinite;
        }
        .group:hover .animate-blink {
          transform: translateY(-8px) scale(1.05) rotateX(6deg) rotateY(-6deg);
          box-shadow: 0 16px 48px 0 rgba(31,38,135,0.22);
        }
      `}</style>
    </main>
  );
}
