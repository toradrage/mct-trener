"use client";

import { useEffect, useMemo, useRef } from "react";

type MoveId = string;

type Metric = {
  label: string;
  value: number; // 0-100
};

type ChatMessage = {
  sender: "therapist" | "patient";
  text: string;
  timestamp: number;
};

type FormulationViewModel = {
  trigger?: string;
  whatIfThought?: string;
  worryChain?: string;
  emotions?: string;
  positiveMetaBelief?: string;
  negativeMetaBelief?: string;
  casStrategy?: string;
};

export default function TherapyRoomHUD(props: {
  scenarioLabel: string;
  onExit: () => void;
  metrics: readonly [Metric, Metric, Metric];
  messages: ChatMessage[];
  interventions: Array<{ id: MoveId; label: string }>;
  selectedIntervention: MoveId | null;
  onSelectIntervention: (id: MoveId) => void;
  moveSectionLabel?: string;
  sendDisabled?: boolean;
  formulation?: {
    model: FormulationViewModel;
    done: number;
    total: number;
    canStartPhase2: boolean;
    onStartPhase2: () => void;
  };
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
    moveSectionLabel,
    sendDisabled,
    formulation,
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
        {formulation ? (
          <div className="formulationCard" aria-label="Kasusformulering">
            <div className="formulationTop">
              <div className="formulationTitle">Kasusformulering</div>
              <div className="formulationProgress">
                {formulation.done}/{formulation.total}
              </div>
            </div>

            <div className="formulationGrid">
              <Field label="Trigger" value={formulation.model.trigger} />
              <Field label="«Hva hvis»" value={formulation.model.whatIfThought} />
              <Field label="Kjede" value={formulation.model.worryChain} />
              <Field label="Følelser" value={formulation.model.emotions} />
              <Field label="+ Meta" value={formulation.model.positiveMetaBelief} />
              <Field label="- Meta" value={formulation.model.negativeMetaBelief} />
              <Field label="CAS" value={formulation.model.casStrategy} />
            </div>

            {formulation.canStartPhase2 ? (
              <button className="startPhase2" type="button" onClick={formulation.onStartPhase2}>
                Start fase 2 (behandling)
              </button>
            ) : (
              <div className="formulationHint">
                Fase 1: kartlegg én konkret episode. Ingen behandling ennå.
              </div>
            )}
          </div>
        ) : null}

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

        <div className="abilities" aria-label={moveSectionLabel ?? "Ability cards"}>
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
          <button
            className="chatSend"
            type="submit"
            disabled={typeof sendDisabled === "boolean" ? sendDisabled : !selectedIntervention}
          >
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

        .formulationCard {
          pointer-events: auto;
          padding: 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: 0 16px 52px rgba(0, 0, 0, 0.20);
        }

        .formulationTop {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .formulationTitle {
          font-weight: 900;
          color: #0b0f19;
          letter-spacing: 0.2px;
        }

        .formulationProgress {
          font-weight: 800;
          color: rgba(11, 15, 25, 0.72);
          font-size: 12px;
        }

        .formulationGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .formulationHint {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(0, 0, 0, 0.62);
        }

        .startPhase2 {
          margin-top: 10px;
          width: 100%;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(28, 78, 216, 0.28);
          background: #eef4ff;
          color: #0b0f19;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.15s, background 0.2s;
        }
        .startPhase2:hover {
          transform: translateY(-1px);
          background: #e2ecff;
        }

        .chatLog {
          pointer-events: auto;
          max-height: 170px;
          overflow: auto;
          padding: 12px 12px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: 0 16px 52px rgba(0, 0, 0, 0.28);
        }

        .chatHint {
          color: rgba(0, 0, 0, 0.62);
          font-size: 13px;
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
          color: #0b0f19;
          border: 1px solid rgba(0, 0, 0, 0.18);
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
          text-wrap: pretty;
        }

        .chatLine.therapist .bubble {
          background: #eef4ff;
          border-color: rgba(28, 78, 216, 0.20);
        }

        .chatLine.patient .bubble {
          background: #ffffff;
          border-color: rgba(0, 0, 0, 0.18);
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

function Field(props: { label: string; value?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr",
        gap: 8,
        alignItems: "baseline",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(11,15,25,0.70)" }}>{props.label}</div>
      <div style={{ fontSize: 13, color: "#0b0f19" }}>{props.value?.trim() ? props.value : "—"}</div>
    </div>
  );
}
