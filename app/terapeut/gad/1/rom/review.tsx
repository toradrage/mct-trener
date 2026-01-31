import Link from "next/link";
import { useSessionStore } from "../../../../../../store/sessionStore";

export default function ReviewPage() {
  const goals = useSessionStore((s) => s.goals);
  const interventions = useSessionStore((s) => s.interventions);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-100 p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center">
        <h1 className="text-2xl font-bold mb-4">Øktoppsummering</h1>
        <div className="w-full mb-6">
          <h2 className="font-semibold mb-2">Mål for økten</h2>
          <ul className="list-disc ml-6 text-gray-700">
            {goals.length > 0 ? goals.map((goal, i) => <li key={i}>{goal}</li>) : <li>Ingen mål registrert</li>}
          </ul>
        </div>
        <div className="w-full mb-6">
          <h2 className="font-semibold mb-2">Teknikker brukt</h2>
          <ul className="list-disc ml-6 text-gray-700">
            {interventions.length > 0 ? interventions.map((intv, i) => <li key={i}>{intv.type}</li>) : <li>Ingen teknikker brukt</li>}
          </ul>
        </div>
        <div className="w-full mb-6">
          <h2 className="font-semibold mb-2">Vurdering</h2>
          <p className="text-gray-700">Bra jobbet! Du har gjennomført en økt og brukt {interventions.length} teknikk(er). Reflekter gjerne over hva som gikk bra og hva du kan gjøre annerledes neste gang.</p>
        </div>
        <Link href="/terapeut/gad" className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition">Start ny økt</Link>
      </div>
    </main>
  );
}
