import { fmt } from '../lib/format';
import type { Derived, Stats } from '../lib/telemetry';
import type { Telemetry } from '../lib/protocol';
import { AttitudeDial } from './AttitudeDial';

interface Props {
  derived: Derived | null;
  frame: Telemetry | null;
  stats: Stats;
  live: boolean;
}

export function ClimateCard({ derived, frame }: { derived: Derived | null; frame: Telemetry | null }) {
  const climate = derived?.climate;
  const temp = frame?.tc ?? null;
  const humidity = frame?.rh ?? null;
  const tempPct = temp === null ? 0 : Math.max(0, Math.min(100, ((temp - 10) / 50) * 100));
  const humPct = humidity === null ? 0 : Math.max(0, Math.min(100, humidity));
  const tone = climate?.level ?? 'nominal';

  return (
    <section className="panel panel--sensor">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Cargo climate</p>
          <h2>Inside the wagon</h2>
        </div>
        <span className="tag tag--sky">DHT11</span>
      </header>

      <div className="readings">
        <div className="reading">
          <span className="reading__label">Temperature</span>
          <span className="reading__value">
            {fmt(temp, 1)}
            <em>°C</em>
          </span>
          <div className="reading__bar">
            <span style={{ width: `${tempPct}%` }} />
            <i className="reading__limit" style={{ left: '80%' }} title="40 °C heat watch" />
          </div>
        </div>
        <div className="reading">
          <span className="reading__label">Humidity</span>
          <span className="reading__value">
            {fmt(humidity, 0)}
            <em>%RH</em>
          </span>
          <div className="reading__bar reading__bar--sky">
            <span style={{ width: `${humPct}%` }} />
            <i className="reading__limit" style={{ left: '85%' }} title="85 %RH condensation" />
          </div>
        </div>
      </div>

      <div className={`pill pill--${tone}`}>
        <span>{climate?.label ?? 'No reading'}</span>
        <p>{climate?.note ?? 'Waiting for the DHT11'}</p>
      </div>
    </section>
  );
}

export function MotionCard({ derived, frame, stats, live }: Props) {
  const attitude = derived?.attitude ?? null;
  const roll = attitude?.roll ?? null;
  const pitch = attitude?.pitch ?? null;
  const tilt = attitude?.tilt ?? null;
  const vibration = derived?.vibration ?? 0;
  const shock = stats.peakShock;

  return (
    <section className="panel panel--sensor">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Motion</p>
          <h2>Wagon attitude</h2>
        </div>
        <span className="tag tag--teal">MPU6050</span>
      </header>

      <div className="motion">
        <AttitudeDial roll={roll} pitch={pitch} />
        <dl className="motion__grid">
          <div>
            <dt>Roll</dt>
            <dd>{roll === null ? '—' : `${roll > 0 ? '+' : ''}${fmt(roll, 1)}°`}</dd>
          </div>
          <div>
            <dt>Pitch</dt>
            <dd>{pitch === null ? '—' : `${pitch > 0 ? '+' : ''}${fmt(pitch, 1)}°`}</dd>
          </div>
          <div>
            <dt>Tilt</dt>
            <dd>{fmt(tilt, 1)}°</dd>
          </div>
          <div>
            <dt>Vibration</dt>
            <dd>{live ? fmt(vibration, 3) : '—'} g</dd>
          </div>
        </dl>
      </div>

      <div className="motion__foot">
        <div>
          <span>Peak shock</span>
          <strong>{fmt(shock, 2)} g</strong>
        </div>
        <div>
          <span>Impacts</span>
          <strong>{stats.impacts}</strong>
        </div>
        <div>
          <span>Max tilt</span>
          <strong>{fmt(stats.maxTilt, 1)}°</strong>
        </div>
      </div>

      {frame?.ax != null && frame?.az != null && (
        <p className="axis-note">
          accel x {fmt(frame.ax, 2)} · y {fmt(frame.ay, 2)} · z {fmt(frame.az, 2)} g
        </p>
      )}
    </section>
  );
}
