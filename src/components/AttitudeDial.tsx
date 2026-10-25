interface Props {
  roll: number | null;
  pitch: number | null;
}

/** Aircraft-style artificial horizon driven by the accelerometer angles. */
export function AttitudeDial({ roll, pitch }: Props) {
  const hasData = roll !== null && pitch !== null;
  const r = hasData ? Math.max(-45, Math.min(45, roll)) : 0;
  const p = hasData ? Math.max(-45, Math.min(45, pitch)) : 0;

  return (
    <div className="dial">
      <svg viewBox="-50 -50 100 100" aria-label="Wagon attitude">
        <defs>
          <clipPath id="dial-clip">
            <circle cx="0" cy="0" r="44" />
          </clipPath>
        </defs>

        <g clipPath="url(#dial-clip)">
          <g transform={`rotate(${-r}) translate(0 ${p * 1.5})`}>
            <rect x="-70" y="-70" width="140" height="70" fill="#1b3a52" />
            <rect x="-70" y="0" width="140" height="70" fill="#3b2a17" />
            <line x1="-70" y1="0" x2="70" y2="0" stroke="#f6f0e4" strokeWidth="1.2" />
            {[-20, -10, 10, 20].map((step) => (
              <line
                key={step}
                x1={step === 10 || step === -10 ? -8 : -5}
                y1={step * 1.5}
                x2={step === 10 || step === -10 ? 8 : 5}
                y2={step * 1.5}
                stroke="rgba(246, 240, 228, 0.7)"
                strokeWidth="0.8"
              />
            ))}
          </g>
        </g>

        <circle cx="0" cy="0" r="44" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="1.2" />
        <path d="M -13 0 L -5 0 M 5 0 L 13 0 M 0 -3 L 0 3" stroke="#f6a723" strokeWidth="2" strokeLinecap="round" />
        <circle cx="0" cy="0" r="1.6" fill="#f6a723" />
      </svg>
      <div className="dial__caption">
        {hasData ? `${r > 0 ? '+' : ''}${r.toFixed(1)}° / ${p > 0 ? '+' : ''}${p.toFixed(1)}°` : 'no IMU data'}
      </div>
    </div>
  );
}
