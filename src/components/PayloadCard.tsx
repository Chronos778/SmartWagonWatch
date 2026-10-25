import type { Derived, Limits } from '../lib/telemetry';
import { fmt } from '../lib/format';
import { Gauge } from './Gauge';

interface Props {
  derived: Derived | null;
  limits: Limits;
  onLimits: (limits: Limits) => void;
  live: boolean;
  targetTonnes: number;
}

export function PayloadCard({ derived, limits, onLimits, live, targetTonnes }: Props) {
  const grams = derived?.grams ?? null;
  const overloaded = (derived?.verdict.tone ?? 'idle') === 'danger';
  const verdict = derived?.verdict ?? {
    tone: 'idle' as const,
    label: 'No data',
    detail: 'Connect the ESP32 to start streaming',
  };
  const targetFraction = limits.max > 0 ? limits.target / limits.max : 0;
  const barPct = Math.max(0, Math.min(100, (derived?.pctMax ?? 0)));

  const setTarget = (value: number) => {
    const target = Math.max(10, Math.min(Number.isFinite(value) ? value : limits.target, limits.max - 10));
    onLimits({ ...limits, target });
  };
  const setMax = (value: number) => {
    const max = Math.max(20, Number.isFinite(value) ? value : limits.max);
    onLimits({ ...limits, max, target: Math.min(limits.target, max - 10) });
  };

  return (
    <section className="panel panel--payload">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Payload</p>
          <h2>Live wagon weight</h2>
        </div>
        <span className="tag tag--amber">HX711</span>
      </header>

      <div className="payload__main">
        <Gauge
          fraction={(derived?.pctMax ?? 0) / 100}
          targetFraction={targetFraction}
          grams={grams}
          pctTarget={derived?.pctTarget ?? 0}
          overloaded={overloaded}
          live={live && grams !== null}
        />
        <div className="payload__side">
          <div className={`verdict verdict--${verdict.tone}`}>
            <span className="verdict__dot" />
            <div>
              <strong>{verdict.label}</strong>
              <p>{verdict.detail}</p>
            </div>
          </div>

          <dl className="mini-stats">
            <div>
              <dt>To target</dt>
              <dd>
                {derived?.toTarget === null || derived?.toTarget === undefined
                  ? '—'
                  : `${derived.toTarget > 0 ? '' : '+'}${fmt(derived.toTarget, 1)} g`}
              </dd>
            </div>
            <div>
              <dt>To limit</dt>
              <dd>
                {derived?.toMax === null || derived?.toMax === undefined
                  ? '—'
                  : `${derived.toMax > 0 ? '' : '+'}${fmt(derived.toMax, 1)} g`}
              </dd>
            </div>
            <div>
              <dt>Scaled</dt>
              <dd>{derived?.tonnes == null ? '—' : `${fmt(derived.tonnes, 1)} t`}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="loadbar">
        <div className={`loadbar__fill ${overloaded ? 'is-over' : ''}`} style={{ width: `${barPct}%` }} />
        <span
          className="loadbar__target"
          style={{ left: `${Math.min(100, targetFraction * 100)}%` }}
          title={`Target ${limits.target} g`}
        />
        <span className="loadbar__limit" title={`Limit ${limits.max} g`} />
      </div>
      <div className="loadbar__legend">
        <span>0 g</span>
        <span className="loadbar__legend-target">target {limits.target} g</span>
        <span className="loadbar__legend-limit">limit {limits.max} g</span>
      </div>

      <div className="limits">
        <label>
          <span>Target</span>
          <input
            type="number"
            min={10}
            step={10}
            value={limits.target}
            onChange={(event) => setTarget(Number(event.target.value))}
          />
          <em>g</em>
        </label>
        <label>
          <span>Overload limit</span>
          <input
            type="number"
            min={20}
            step={10}
            value={limits.max}
            onChange={(event) => setMax(Number(event.target.value))}
          />
          <em>g</em>
        </label>
        <p className="limits__note">
          Scaled tonnage assumes a {targetTonnes} t wagon at the target payload.
        </p>
      </div>
    </section>
  );
}
