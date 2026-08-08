import Image from "next/image";

export default function Loading() {
  // ponytail: film-strip dots + shimmer line, white bg, logo untouched
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-8 bg-white"
    >
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scaleY(0.4); opacity: 0.3; }
          40%            { transform: scaleY(1);   opacity: 1; }
        }
        .bar { animation: bounce 1.2s ease-in-out infinite; }
        .bar:nth-child(1) { animation-delay: 0s; }
        .bar:nth-child(2) { animation-delay: 0.15s; }
        .bar:nth-child(3) { animation-delay: 0.3s; }
        .bar:nth-child(4) { animation-delay: 0.45s; }
        .bar:nth-child(5) { animation-delay: 0.6s; }

        .shimmer-line {
          background: linear-gradient(90deg, #f0f0f0 25%, #EA1C2530 50%, #f0f0f0 75%);
          background-size: 400px 100%;
          animation: shimmer 1.6s linear infinite;
        }
      `}</style>

      <Image
        src="/logo.png"
        alt="Logo Liss TV"
        width={300}
        height={300}
        className="object-contain"
        priority
      />

      {/* Sound-wave / equalizer bars */}
      <div className="flex items-center gap-1.5" style={{ height: 36 }}>
        {[1,2,3,4,5].map((i) => (
          <div
            key={i}
            className="bar w-1.5 rounded-full"
            style={{ height: 36, background: "#EA1C25", transformOrigin: "center" }}
          />
        ))}
      </div>

      {/* Shimmer line */}
      <div className="shimmer-line w-24 h-0.5 rounded-full" />
    </main>
  );
}
