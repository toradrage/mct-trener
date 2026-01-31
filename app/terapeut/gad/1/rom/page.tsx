"use client";
import { useState } from "react";
import Image from "next/image";

export default function Terapirom() {
  const [melding, setMelding] = useState("");
  const [visPasientSvar, setVisPasientSvar] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setVisPasientSvar(true);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-green-100 p-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center relative">
        {/* Terapirom bakgrunn */}
        <div className="absolute inset-0 z-0 flex justify-center items-end">
          <div className="w-full h-2/3 bg-green-200 rounded-b-2xl flex items-end justify-center">
            {/* Plante og bakgrunnsdetaljer kan legges til her */}
          </div>
        </div>
        {/* Avatar */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="animate-blink">
            <Image
              src="/avatar1.png"
              alt="Pasient smilende"
              width={180}
              height={220}
              className="rounded-xl border-4 border-blue-200 shadow-lg bg-white"
            />
          </div>
          {/* Snakkeboble fra pasient */}
          {visPasientSvar && (
            <div className="mt-4 bg-gray-100 border border-gray-300 rounded-xl px-4 py-2 text-gray-800 shadow text-lg max-w-xs">
              Jeg bekymrer meg veldig mye, og vet ikke hva jeg skal gjøre.
            </div>
          )}
        </div>
        {/* Terapeut skriver melding */}
        {!visPasientSvar && (
          <form onSubmit={handleSend} className="w-full mt-8 flex flex-col items-center z-10">
            <label htmlFor="melding" className="mb-2 text-gray-700 font-medium">
              Skriv til pasienten:
            </label>
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
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition"
            >
              Send
            </button>
          </form>
        )}
      </div>
      <style jsx>{`
        @keyframes blink {
          0%, 97%, 100% { opacity: 1; }
          98%, 99% { opacity: 0.2; }
        }
        .animate-blink {
          animation: blink 4s infinite;
        }
      `}</style>
    </main>
  );
}
