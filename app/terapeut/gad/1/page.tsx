import Link from "next/link";

export default function GadLevel1Page() {
  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">GAD - Vanskelighetsgrad 1</h1>
        <p className="text-gray-600">Simulering av terapisesjon med AI-pasient.</p>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-gray-50">
            <div className="font-semibold mb-2">Meta-antakelse: "Bekymring er ukontrollerbar"</div>
            <div className="mb-2">Tro på antakelsen: <span className="font-bold">80/100</span></div>
            <div className="mb-2">Hva vil du gjøre?</div>
            <div className="grid grid-cols-1 gap-2">
              <button className="w-full px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition">Sokratiske spørsmål</button>
              <button className="w-full px-4 py-2 rounded-lg bg-purple-500 text-white font-semibold hover:bg-purple-600 transition">Eksperiment</button>
              <button className="w-full px-4 py-2 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600 transition">Detached Mindfulness</button>
              <button className="w-full px-4 py-2 rounded-lg bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition">Verbal reattribusjon</button>
            </div>
            <div className="mt-6 flex justify-center">
              <Link href="/terapeut/gad/1/rom" className="px-6 py-3 rounded-lg bg-pink-500 text-white font-bold text-lg shadow hover:bg-pink-600 transition">
                Start terapisesjon
              </Link>
            </div>
          </div>
        </div>
        <Link href="/terapeut/gad" className="text-sm text-blue-700 hover:underline">
          ← Tilbake til vanskelighetsvalg
        </Link>
      </div>
    </main>
  );
}
