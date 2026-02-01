"use client";

import { useEffect, useMemo, useRef } from "react";

type InterventionType = "sokratisk" | "eksperiment" | "mindfulness" | "verbal";

type Metric = {
  label: string;
  value: number; // 0-100
};

type ChatMessage = {
  sender: "therapist" | "patient";
  text: string;
  timestamp: number;
};

export default function TherapyRoomHUD(props: {
  scenarioLabel: string;
  onExit: () => void;
  metrics: readonly [Metric, Metric, Metric];
  messages: ChatMessage[];
  interventions: Array<{ id: InterventionType; label: string }>;
  selectedIntervention: InterventionType | null;
  onSelectIntervention: (id: InterventionType) => void;
  message: string;
  onChangeMessage: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const {
    scenarioLabel,
    onExit,
    metrics,
    messages,
    interventions,
    selectedIntervention,
    onSelectIntervention,
    message,
    onChangeMessage,
    onSubmit,
  } = props;

  const chatLogRef = useRef<HTMLDivElement | null>(null);

  const recent = useMemo(() => {
    // Keep it lightweight: show only recent turns.
    return messages.slice(Math.max(0, messages.length - 8));
  }, [messages]);

  useEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [recent.length]);

  return (
    <div className="hud" aria-label="HUD overlay">
      {/* Top-left */}
      <div className="hudCorner left" aria-label="Scenario">
        {scenarioLabel}
      </div>

      {/* Top-right */}
      <button className="hudCorner right" onClick={onExit}>
        Avslutt økt
      </button>

      {/* Right-side metrics */}
      <div className="hudRight" aria-label="Målinger">
        {metrics.map((m) => (
          <div key={m.label} className="metricCard">
            <div className="metricTop">
              <div className="metricLabel">{m.label}</div>
              <div className="metricValue">{Math.round(m.value)}%</div>
            </div>
            <div className="bar" aria-hidden="true">
              <div className="fill" style={{ width: `${Math.max(0, Math.min(100, m.value))}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: input + ability cards */}
      <div className="hudBottom" aria-label="Chat og abilities">
        <div className="chatLog" aria-label="Chat logg" ref={chatLogRef}>
          {recent.length === 0 ? (
            <div className="chatHint">Velg en intervensjon og send en melding for å starte.</div>
          ) : (
            recent.map((m) => (
              <div
                key={`${m.timestamp}-${m.sender}`}
                className={`chatLine ${m.sender === "therapist" ? "therapist" : "patient"}`}
              >
                <span className="bubble">{m.text}</span>
              </div>
            ))
          )}
        </div>

        <div className="abilities" aria-label="Ability cards">
          {interventions.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`ability ${selectedIntervention === i.id ? "active" : ""}`}
              onClick={() => onSelectIntervention(i.id)}
              aria-pressed={selectedIntervention === i.id}
              title={i.label}
            >
              <div className="abilityTitle">{i.label}</div>
              <div className="abilityHint">Velg → skriv → send</div>
            </button>
          ))}
        </div>

        <form className="chat" onSubmit={onSubmit}>
          <input
            className="chatInput"
            value={message}
            onChange={(e) => onChangeMessage(e.target.value)}
            placeholder="Skriv til pasienten…"
            aria-label="Melding til pasienten"
            required
          />
          <button className="chatSend" type="submit" disabled={!selectedIntervention}>
            Send
          </button>
        </form>
      </div>

      <style jsx>{`
        .hud {
          position: absolute;
          inset: 0;
          z-index: 10;
          pointer-events: none;
        }

        .hudCorner {
          position: absolute;
          top: 16px;
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.10);
          border: 1px solid rgba(255, 255, 255, 0.16);
          color: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(16px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
          font-weight: 800;
          letter-spacing: 0.2px;
          pointer-events: none;
        }
        .hudCorner.left {
          left: 16px;
        }
        .hudCorner.right {
          right: 16px;
          pointer-events: auto;
          cursor: pointer;
          transition: transform 0.15s, background 0.2s;
        }
        .hudCorner.right:hover {
          transform: translateY(-2px);
          background: rgba(236, 72, 153, 0.22);
        }

        /* Right-side small bars */
        .hudRight {
          position: absolute;
          right: 16px;
          top: 72px;
          display: grid;
          gap: 10px;
          width: 230px;
          pointer-events: none;
        }

        .metricCard {
          padding: 10px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(14px);
          box-shadow: 0 16px 46px rgba(0, 0, 0, 0.30);
        }

        .metricTop {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }

        .metricLabel {
          font-weight: 800;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.86);
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .metricValue {
          font-weight: 900;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.88);
        }

        .bar {
          height: 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.10);
          overflow: hidden;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(34, 197, 94, 0.75) 0%, rgba(59, 130, 246, 0.78) 60%, rgba(236, 72, 153, 0.70) 100%);
          box-shadow: 0 0 18px rgba(59, 130, 246, 0.22);
        }

        /* Bottom: minimal glass strip (no big panel) */
        .hudBottom {
          position: absolute;
          left: 16px;
          right: 16px;
          bottom: 12px;
          display: grid;
          gap: 8px;
          pointer-events: none;
        }

        .chatLog {
          pointer-events: auto;
          max-height: 170px;
          overflow: auto;
          padding: 12px 12px;
          border-radius: 16px;
          background: rgba(6, 10, 22, 0.70);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.20);
        }

        .chatHint {
          color: rgba(255, 255, 255, 0.70);
          font-size: 12px;
        }

        .chatLine {
          display: flex;
          margin: 6px 0;
        }

        .chatLine.therapist {
          justify-content: flex-end;
        }

        .chatLine.patient {
          justify-content: flex-start;
        }

        .bubble {
          /* readability */
          max-width: min(540px, 84vw);
          padding: 10px 12px;
          border-radius: 16px;
          line-height: 1.45;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(10, 14, 26, 0.88);
          box-shadow: 0 14px 44px rgba(0, 0, 0, 0.28);
          text-wrap: pretty;
        }

        .chatLine.therapist .bubble {
          background: rgba(16, 36, 86, 0.78);
          border-color: rgba(99, 162, 255, 0.28);
        }

        .chatLine.patient .bubble {
          background: rgba(10, 14, 26, 0.90);
          border-color: rgba(255, 255, 255, 0.16);
        }

        .abilities {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          pointer-events: auto;
        }

        .ability {
          min-width: 200px;
          text-align: left;
          padding: 8px 10px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(18px);
          color: rgba(255, 255, 255, 0.92);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
          cursor: pointer;
          transition: transform 0.15s, border-color 0.2s, background 0.2s;
        }
        .ability:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.10);
        }
        .ability.active {
          border-color: rgba(59, 130, 246, 0.55);
          box-shadow: 0 22px 66px rgba(59, 130, 246, 0.16);
        }

        .abilityTitle {
          font-weight: 900;
          letter-spacing: 0.1px;
          font-size: 12px;
          margin-bottom: 2px;
        }
        .abilityHint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.70);
        }

        .chat {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          pointer-events: auto;
        }

        .chatInput {
          height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.09);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(18px);
          box-shadow: 0 12px 42px rgba(0, 0, 0, 0.24);
          outline: none;
        }
        .chatInput::placeholder {
          color: rgba(255, 255, 255, 0.55);
        }

        .chatSend {
          height: 40px;
          padding: 0 14px;
          border-radius: 999px;
          font-weight: 900;
          background: rgba(37, 99, 235, 0.86);
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: white;
          box-shadow: 0 14px 46px rgba(37, 99, 235, 0.16);
          cursor: pointer;
          transition: transform 0.15s, opacity 0.2s;
        }
        .chatSend:hover {
          transform: translateY(-2px);
        }
        .chatSend:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 820px) {
          .hudRight {
            width: 200px;
          }
          .ability {
            min-width: 180px;
          }
        }

        @media (max-width: 640px) {
          .hudRight {
            display: none;
          }
          .ability {
            min-width: 180px;
          }
        }
      `}</style>
    </div>
  );
}
