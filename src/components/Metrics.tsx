import { duration, fmt } from '../lib/format';
import type { Derived, Limits, Stats } from '../lib/telemetry';

interface Props {
  derived: Derived | null;
  stats: Stats;
  limits: Limits;
  live: boolean;
}

export function Metrics({ derived, stats, limits, live }: Props) {
  const rate = derived?.ratePerMin ?? null;
  const trend = derived?.trend ?? 'steady';
  const atTarget = (derived?.pctTarget ?? 0) >= 100;
  const tiles = [
    {
      label: 'Loading rate',
      value: rate === null ? '—' : `${Math.abs(rate) < 1 ? '0' : fmt(Math.abs(rate), 0)}`,
      unit: 'g/min',
      hint:
        trend === 'rising'
          ? '▲ filling'
          : trend === 'falling'
            ? '▼ unloading or loss'
            : 'steady',
      tone: trend === 'falling' && (rate ?? 0) < -20 ? 'danger' : trend === 'rising' ? 'ok' : 'idle',
    },
    {
      label: 'Time to target',
      value: atTarget ? 'done' : derived?.etaSeconds == null ? '—' : duration(derived.etaSeconds),
      unit: '',
      hint: atTarget
        ? 'target payload reached'
        : derived?.etaSeconds == null
          ? 'at current rate'
          : `at ${fmt(rate, 0)} g/min`,
      tone: atTarget ? 'ok' : 'idle',
    },
    {
      label: 'Utilisation',
      value: live && derived ? fmt(derived.pctTarget, 0) : '—',
      unit: '%',
      hint: `of ${limits.target} g target`,
      tone: (derived?.pctTarget ?? 0) > 100 ? 'danger' : 'ok',
    },
    {
      label: 'Ride index',
      value: live && derived?.stability != null ? fmt(derived.stability, 0) : '—',
      unit: '/100',
      hint:
        derived?.stability == null
          ? 'no IMU data'
          : derived.stability >= 80
            ? 'smooth ride'
            : derived.stability >= 55
              ? 'some vibration'
              : 'rough handling',
      tone:
        derived?.stability == null ? 'idle' : derived.stability >= 80 ? 'ok' : derived.stability >= 55 ? 'warn' : 'danger',
    },
    {
      label: 'Peak shock',
      value: live ? fmt(stats.peakShock, 2) : '—',
      unit: 'g',
      hint: 'session peak',
      tone: stats.peakShock > 0.8 ? 'danger' : stats.peakShock > 0.35 ? 'warn' : 'idle',
    },
    {
      label: 'Impacts',
      value: live ? String(stats.impacts) : '—',
      unit: '',
      hint: 'above 0.35 g',
      tone: stats.impacts > 0 ? 'warn' : 'idle',
    },
  ] as const;

  return (
    <section className="panel panel--metrics">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Derived</p>
          <h2>What the numbers mean</h2>
        </div>
        <span className="tag">LIVE ANALYSIS</span>
      </header>

      <div className="metrics">
        {tiles.map((tile) => (
          <div key={tile.label} className={`metric metric--${tile.tone}`}>
            <span className="metric__label">{tile.label}</span>
            <span className="metric__value">
              {tile.value}
              {tile.unit && <em>{tile.unit}</em>}
            </span>
            <span className="metric__hint">{tile.hint}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
