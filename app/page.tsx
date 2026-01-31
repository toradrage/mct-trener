import Link from "next/link";
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <h1 className="text-3xl font-bold">MCT-trener</h1>
        <p className="text-gray-600">Velg rolle for å fortsette</p>


        <div className="grid grid-cols-1 gap-3">
          <Link
            href="/terapeut"
            className="px-6 py-4 rounded-lg bg-blue-600 text-white font-semibold text-center"
          >
            Terapeut
          </Link>
          <Link
            href="/pasient"
            className="px-6 py-4 rounded-lg bg-green-600 text-white font-semibold text-center"
          >
            Pasient
          </Link>
        </div>

        <p className="text-xs text-gray-500">
          Prototype: kun treningsmodus (ingen pasientdata).
        </p>
      </div>
    </main>
  );
}
