"use client";

import Image from "next/image";

export default function TherapyRoomScene(props: {
  avatarSrc: string;
  showSpeech: boolean;
  speechText: string;
}) {
  const { avatarSrc, showSpeech, speechText } = props;

  return (
    <div className="sceneRoot" aria-label="Terapirom scene">
      {/* 2.5D layers: background room */}
      <div className="layer bg" aria-hidden="true">
        <div className="vignette" />
        <div className="room" />
        <div className="lightRays" />
        <div className="groundLight" />
      </div>

      {/* midground: patient */}
      <div className="layer mid" aria-hidden="false">
        <div className="stage">
          <div className="floorShadow" aria-hidden="true" />

          <div className="patientActor">
            <div className="spot" aria-hidden="true" />
            <div className="chair" aria-hidden="true" />

            <div className="patientCard animateBlink">
              <Image
                src={avatarSrc}
                alt="Pasient"
                width={240}
                height={280}
                className="patientImg"
                priority
              />
              <div className="patientDropShadow" aria-hidden="true" />
            </div>

            {showSpeech && (
              <div className="speechBubble" role="status" aria-live="polite">
                {speechText}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* foreground: subtle glass/film effects */}
      <div className="layer fg" aria-hidden="true">
        <div className="filmGrain" />
        <div className="bloomEdge" />
      </div>

      <style jsx>{`
        .sceneRoot {
          position: absolute;
          inset: 0;
          overflow: hidden;
          background: #0b1220;
        }

        .layer {
          position: absolute;
          inset: 0;
        }

        /* Background: room (walls + floor + lighting) */
        .bg {
          z-index: 0;
        }

        .room {
          position: absolute;
          inset: -10% -10% -10% -10%;
          background:
            /* subtle wall texture */
            repeating-linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.02) 0,
              rgba(255, 255, 255, 0.02) 1px,
              rgba(255, 255, 255, 0) 1px,
              rgba(255, 255, 255, 0) 8px
            ),
            /* wall light */
            radial-gradient(
              1000px 600px at 55% 18%,
              rgba(255, 255, 255, 0.16) 0%,
              rgba(255, 255, 255, 0) 62%
            ),
            /* ceiling tint */
            linear-gradient(
              180deg,
              rgba(30, 64, 175, 0.22) 0%,
              rgba(15, 23, 42, 0.95) 56%,
              rgba(2, 6, 23, 0.98) 100%
            );
          filter: saturate(1.05);
          transform: translate3d(0, 0, 0);
          animation: roomDrift 18s ease-in-out infinite alternate;
        }

        /* Floor plane (2.5D) */
        .room::after {
          content: "";
          position: absolute;
          left: -20%;
          right: -20%;
          bottom: -35%;
          height: 70%;
          transform-origin: 50% 100%;
          transform: perspective(1200px) rotateX(62deg);
          background:
            radial-gradient(
              900px 500px at 50% 30%,
              rgba(255, 255, 255, 0.10) 0%,
              rgba(255, 255, 255, 0) 60%
            ),
            linear-gradient(
              180deg,
              rgba(148, 163, 184, 0.14) 0%,
              rgba(15, 23, 42, 0.82) 70%,
              rgba(2, 6, 23, 0.92) 100%
            );
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .vignette {
          position: absolute;
          inset: -20%;
          background: radial-gradient(
            1200px 800px at 50% 20%,
            rgba(0, 0, 0, 0) 0%,
            rgba(0, 0, 0, 0.45) 62%,
            rgba(0, 0, 0, 0.75) 100%
          );
          z-index: 2;
          pointer-events: none;
        }

        .lightRays {
          position: absolute;
          inset: -20% -10% -10% -10%;
          background: conic-gradient(
            from 220deg at 55% 18%,
            rgba(255, 255, 255, 0) 0deg,
            rgba(255, 255, 255, 0.10) 18deg,
            rgba(255, 255, 255, 0) 52deg,
            rgba(255, 255, 255, 0.08) 92deg,
            rgba(255, 255, 255, 0) 140deg
          );
          filter: blur(26px);
          opacity: 0.55;
          mix-blend-mode: screen;
          pointer-events: none;
          animation: raysDrift 14s ease-in-out infinite alternate;
        }

        .groundLight {
          position: absolute;
          left: 50%;
          bottom: -6%;
          transform: translateX(-50%);
          width: min(980px, 96vw);
          height: min(520px, 50vh);
          background: radial-gradient(
            ellipse at 50% 25%,
            rgba(255, 251, 235, 0.10) 0%,
            rgba(59, 130, 246, 0.07) 35%,
            rgba(0, 0, 0, 0) 70%
          );
          filter: blur(10px);
          opacity: 0.95;
          mix-blend-mode: screen;
          pointer-events: none;
        }

        /* Mid layer: stage + patient */
        .mid {
          z-index: 1;
          display: grid;
          place-items: center;
          perspective: 1400px;
          pointer-events: none;
        }

        .stage {
          width: min(1180px, 92vw);
          height: min(720px, 76vh);
          position: relative;
          transform-style: preserve-3d;
          transform: rotateX(10deg) translateY(10px);
          animation: cameraDrift 12s ease-in-out infinite alternate;
        }

        .floorShadow {
          position: absolute;
          left: 50%;
          bottom: 6%;
          transform: translateX(-50%) translateZ(-40px);
          width: 74%;
          height: 22%;
          background: radial-gradient(
            ellipse at center,
            rgba(0, 0, 0, 0.58) 0%,
            rgba(0, 0, 0, 0.22) 42%,
            rgba(0, 0, 0, 0) 74%
          );
          filter: blur(14px);
          border-radius: 999px;
          opacity: 0.85;
        }

        .patientActor {
          position: absolute;
          left: 50%;
          bottom: 10%;
          transform: translateX(-50%) translateZ(55px);
          transform-style: preserve-3d;
        }

        .spot {
          position: absolute;
          left: 50%;
          top: 10px;
          transform: translateX(-50%) translateZ(-10px);
          width: 420px;
          height: 280px;
          background: radial-gradient(
            circle at 50% 45%,
            rgba(255, 251, 235, 0.92) 0%,
            rgba(254, 249, 195, 0.45) 46%,
            rgba(255, 255, 255, 0) 74%
          );
          filter: blur(20px);
          opacity: 0.8;
        }

        .chair {
          position: absolute;
          left: 50%;
          top: 260px;
          transform: translateX(-50%) translateZ(-24px);
          width: 292px;
          height: 155px;
          border-radius: 28px;
          background: linear-gradient(
            180deg,
            rgba(148, 163, 184, 0.20) 0%,
            rgba(148, 163, 184, 0.06) 100%
          );
          box-shadow: 0 30px 70px rgba(0, 0, 0, 0.22);
        }

        .patientCard {
          position: relative;
          transform: translateZ(22px);
        }

        .patientCard::after {
          content: "";
          position: absolute;
          left: 50%;
          bottom: 10px;
          transform: translateX(-50%);
          width: 72%;
          height: 18px;
          border-radius: 999px;
          background: radial-gradient(
            ellipse at center,
            rgba(0, 0, 0, 0.55) 0%,
            rgba(0, 0, 0, 0.18) 50%,
            rgba(0, 0, 0, 0) 78%
          );
          filter: blur(6px);
          opacity: 0.65;
          pointer-events: none;
        }

        .patientImg {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.06);
          box-shadow:
            0 22px 80px rgba(0, 0, 0, 0.55),
            0 0 0 4px rgba(59, 130, 246, 0.22);
        }

        .patientDropShadow {
          position: absolute;
          left: 50%;
          top: 282px;
          transform: translateX(-50%) translateZ(-30px);
          width: 260px;
          height: 56px;
          border-radius: 999px;
          background: radial-gradient(
            ellipse at center,
            rgba(0, 0, 0, 0.52) 0%,
            rgba(0, 0, 0, 0.20) 45%,
            rgba(0, 0, 0, 0) 78%
          );
          filter: blur(10px);
          opacity: 0.78;
        }

        .speechBubble {
          position: absolute;
          left: 50%;
          top: -18px;
          transform: translateX(-50%) translateZ(64px);
          max-width: min(560px, 84vw);
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(10, 14, 26, 0.90);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.45);
          color: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(16px);
          line-height: 1.45;
          font-size: 15px;
          text-wrap: pretty;
        }

        /* Foreground effects */
        .fg {
          z-index: 3;
          pointer-events: none;
        }

        .filmGrain {
          position: absolute;
          inset: -30%;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.04) 0 1px, rgba(0, 0, 0, 0) 2px),
            radial-gradient(circle at 80% 55%, rgba(255, 255, 255, 0.03) 0 1px, rgba(0, 0, 0, 0) 2px),
            radial-gradient(circle at 45% 70%, rgba(255, 255, 255, 0.035) 0 1px, rgba(0, 0, 0, 0) 2px);
          background-size: 120px 120px;
          mix-blend-mode: overlay;
          opacity: 0.35;
          filter: blur(0.4px);
        }

        .bloomEdge {
          position: absolute;
          inset: -20%;
          background: radial-gradient(
            900px 600px at 55% 18%,
            rgba(59, 130, 246, 0.10) 0%,
            rgba(59, 130, 246, 0) 62%
          );
          mix-blend-mode: screen;
          opacity: 0.85;
          filter: blur(10px);
        }

        /* Subtle avatar blink */
        @keyframes blink {
          0%,
          97%,
          100% {
            opacity: 1;
          }
          98%,
          99% {
            opacity: 0.25;
          }
        }
        .animateBlink {
          animation: blink 4s infinite;
        }

        @keyframes roomDrift {
          0% {
            transform: translate3d(-6px, -4px, 0) scale(1.01);
          }
          100% {
            transform: translate3d(8px, 6px, 0) scale(1.02);
          }
        }

        @keyframes raysDrift {
          0% {
            transform: translate3d(10px, -6px, 0) rotate(-0.6deg);
            opacity: 0.50;
          }
          100% {
            transform: translate3d(-12px, 8px, 0) rotate(0.7deg);
            opacity: 0.62;
          }
        }

        @keyframes cameraDrift {
          0% {
            transform: rotateX(9.2deg) rotateZ(-0.35deg) translateY(8px) translateX(-6px);
          }
          100% {
            transform: rotateX(10.6deg) rotateZ(0.35deg) translateY(12px) translateX(6px);
          }
        }

        @media (max-width: 720px) {
          .stage {
            height: min(560px, 70vh);
          }
          .speechBubble {
            max-width: min(88vw, 520px);
          }
        }
      `}</style>
    </div>
  );
}
