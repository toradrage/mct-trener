import { NextResponse } from "next/server";
import {
  calibratePatientSpeech,
  violatesPatientLanguageHardRules,
  violatesPatientVoice,
} from "../../../../simulator/patientLanguage";

export const runtime = "nodejs";

type RequestBody = {
  rulesReply: string;
  systemFeedback: string;
  phase: "early" | "mid" | "late";
  interventionType: string;
  difficultyLevel: 1 | 2 | 3;
  patientState: {
    beliefUncontrollability: number;
    beliefDanger: number;
    beliefPositive: number;
    simEngagement?: number;
    simCasDeltaEma?: number;
  };
};

function pickModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

function baseUrl() {
  return process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY" },
      { status: 501 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const rulesReply = (body.rulesReply || "").trim();
  if (!rulesReply) {
    return NextResponse.json({ ok: false, error: "Missing rulesReply" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const prompt = {
      role: "user" as const,
      content:
        "Du er en pasient i en MCT-treningssimulator (GAD). Oppgaven er å parafrasere en eksisterende pasientreplikk til kort, menneskelig norsk.\n" +
        "Viktige regler:\n" +
        "- Ikke endre mening eller retning (kun språk).\n" +
        "- Ikke introduser nye fakta, nye symptomer eller nye hendelser.\n" +
        "- Ikke gi råd eller forklaringer; kun pasientens replikk.\n" +
        "- 1 kort setning. Naturlig og litt uperfekt. Gjerne nøling/uklarhet.\n" +
        "- Beskriv opplevelse, ikke mekanisme. Ikke forklar hvorfor.\n" +
        "- Bruk hverdagsspråk. Unngå terapeutiske begreper.\n" +
        "- Bruk konsekvent 1. person entall (jeg).\n" +
        "- IKKE bruk ordene: vi, man, en.\n" +
        "- IKKE bruk ordene: prosess, analyse-modus, metakognisjon, CAS, monitorering.\n" +
        "- Ikke referer til at du er en AI, en modell eller at du parafraserer.\n\n" +
        "Kontekst (for tone, ikke for nye fakta):\n" +
        JSON.stringify(
          {
            phase: body.phase,
            interventionType: body.interventionType,
            difficultyLevel: body.difficultyLevel,
            patientState: body.patientState,
            systemFeedback: body.systemFeedback,
          },
          null,
          2,
        ) +
        "\n\nOriginal pasientreplikk (skal parafraseres):\n" +
        rulesReply,
    };

    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: pickModel(),
        temperature: 0.7,
        max_tokens: 90,
        messages: [
          {
            role: "system",
            content:
              "Du skriver kun pasientens replikk. Ingen meta-kommentarer. Ingen punktlister.",
          },
          prompt,
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: `Upstream error: ${res.status}`, details: text.slice(0, 800) },
        { status: 502 },
      );
    }

    const json = (await res.json()) as any;
    const out = (json?.choices?.[0]?.message?.content ?? "").trim();

    if (!out) {
      return NextResponse.json(
        { ok: false, error: "Empty completion" },
        { status: 502 },
      );
    }

    // Safety: keep it short.
    const rawReply = out.split("\n").join(" ").slice(0, 280).trim();

    // Hard patient-language rules: if the LLM uses forbidden pronouns, therapy terms, or explicit insight, fall back.
    if (!rawReply || violatesPatientVoice(rawReply) || violatesPatientLanguageHardRules(rawReply)) {
      return NextResponse.json({ ok: true, reply: calibratePatientSpeech(rulesReply, { phase: body.phase }) });
    }

    return NextResponse.json({ ok: true, reply: calibratePatientSpeech(rawReply, { phase: body.phase }) });
  } catch (e: any) {
    const aborted = e?.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? "Timeout" : "Request failed" },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
