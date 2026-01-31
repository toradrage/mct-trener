import Link from "next/link";

const levels = [
  { id: "1", title: "Vanskelighetsgrad 1 (lett)" },
  { id: "2", title: "Vanskelighetsgrad 2 (middels)" },
  { id: "3", title: "Vanskelighetsgrad 3 (vanskelig)" },
];

export default function GadPage() {
  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Generalisert angstlidelse (GAD)</h1>
          <p className="text-gray-600">Velg vanskelighetsgrad for pasient.</p>
        </div>

        <div className="flex flex-row gap-6 justify-center">
          <div className="flex flex-col items-center">
            <img src="/avatar1.png" alt="Smilende pasient" className="w-36 h-44 object-cover rounded-xl border-4 border-blue-300 mb-2 bg-white shadow" />
            <div className="font-semibold">Vanskelighetsgrad 1 (lett)</div>
            <div className="text-sm text-gray-600 mb-2">Smilende og samarbeidsvillig</div>
            <Link href="/terapeut/gad/1" className="px-4 py-2 rounded-lg bg-blue-500 text-white font-semibold hover:bg-blue-600 transition">Velg</Link>
          </div>
          <div className="flex flex-col items-center">
            <img src="/avatar2.png" alt="Nøytral pasient" className="w-36 h-44 object-cover rounded-xl border-4 border-gray-300 mb-2 bg-white shadow" />
            <div className="font-semibold">Vanskelighetsgrad 2 (middels)</div>
            <div className="text-sm text-gray-600 mb-2">Nøytral og litt skeptisk</div>
            <Link href="/terapeut/gad/2" className="px-4 py-2 rounded-lg bg-gray-500 text-white font-semibold hover:bg-gray-600 transition">Velg</Link>
          </div>
          <div className="flex flex-col items-center">
            <img src="/avatar3.png" alt="Bekymret pasient" className="w-36 h-44 object-cover rounded-xl border-4 border-red-300 mb-2 bg-white shadow" />
            <div className="font-semibold">Vanskelighetsgrad 3 (vanskelig)</div>
            <div className="text-sm text-gray-600 mb-2">Bekymret og motvillig</div>
            <Link href="/terapeut/gad/3" className="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600 transition">Velg</Link>
          </div>
        </div>

        <Link href="/terapeut" className="text-sm text-blue-700 hover:underline">
          ← Tilbake til lidelsesvalg
        </Link>
      </div>
    </main>
  );
}
