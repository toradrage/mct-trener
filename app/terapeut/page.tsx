import Link from "next/link";

const disorders = [
  { id: "gad", title: "Generalisert angstlidelse (GAD)" },
  { id: "depresjon", title: "Depresjon" },
  { id: "ptsd", title: "PTSD" },
  { id: "ocd", title: "OCD" },
];

export default function terapeutPage() {
  return (
    <main className="min-h-screen p-6 flex items-center justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">terapeut</h1>
          <p className="text-gray-600">Velg lidelse du vil trene på.</p>
        </div>

        <div className="grid gap-3">
          {disorders.map((d) => (
            <Link
              key={d.id}
              href={`/terapeut/${d.id}`}
              className="block rounded-lg border p-4 hover:bg-gray-50"
            >
              <div className="font-semibold">{d.title}</div>
              <div className="text-sm text-gray-600">Klikk for å fortsette</div>
            </Link>
          ))}
        </div>

        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← Tilbake til rollevalg
        </Link>
      </div>
    </main>
  );
}

