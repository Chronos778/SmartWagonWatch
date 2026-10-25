interface Props {
  /** Fraction of the limit, 0..1+ */
  fraction: number;
  targetFraction: number;
  grams: number | null;
  pctTarget: number;
  overloaded: boolean;
  live: boolean;
}

const SIZE = 210;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 84;
const START = -135;
const SWEEP = 270;

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const startPoint = polar(cx, cy, r, end);
  const endPoint = polar(cx, cy, r, start);
  const largeArc = end - start <= 180 ? '0' : '1';
  return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
}

export function Gauge({ fraction, targetFraction, grams, pctTarget, overloaded, live }: Props) {
  const progress = Math.max(0, Math.min(1, fraction)) * 100;
  const targetAngle = START + SWEEP * Math.max(0, Math.min(1, targetFraction));
  const targetInner = polar(CX, CY, R - 15, targetAngle);
  const targetOuter = polar(CX, CY, R + 15, targetAngle);
  const state = overloaded ? 'danger' : !live ? 'idle' : 'ok';

  return (
    <div className={`gauge gauge--${state}`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Payload gauge">
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#2fe3b8" />
            <stop offset="55%" stopColor="#f6a723" />
            <stop offset="100%" stopColor="#ff8a3d" />
          </linearGradient>
          <linearGradient id="gauge-danger" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffb36b" />
            <stop offset="100%" stopColor="#ff3b53" />
          </linearGradient>
        </defs>

        <path d={arcPath(CX, CY, R, START, START + SWEEP)} className="gauge__track" />
        <path
          d={arcPath(CX, CY, R, START, START + SWEEP)}
          className="gauge__value"
          pathLength={100}
          strokeDasharray={`${progress} 100`}
          stroke={overloaded ? 'url(#gauge-danger)' : 'url(#gauge-fill)'}
        />

        <line
          x1={targetInner.x}
          y1={targetInner.y}
          x2={targetOuter.x}
          y2={targetOuter.y}
          className="gauge__target"
        />
        {Array.from({ length: 13 }).map((_, index) => {
          const angle = START + (SWEEP / 12) * index;
          const outer = polar(CX, CY, R + 9, angle);
          const inner = polar(CX, CY, R + 3, angle);
          return (
            <line
              key={index}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="gauge__tick"
            />
          );
        })}
      </svg>

      <div className="gauge__label">
        <span className="gauge__value-text">
          {grams === null ? '—' : grams.toFixed(1)}
          <em>g</em>
        </span>
        <span className="gauge__pct">
          {live ? `${pctTarget.toFixed(0)}% of target` : 'waiting for data'}
        </span>
      </div>
    </div>
  );
}
