import { fmt } from '../lib/format';
import type { Derived, Stats } from '../lib/telemetry';
import type { AttitudeSettings } from '../lib/derive';
import type { Telemetry } from '../lib/protocol';
import { AttitudeDial } from './AttitudeDial';

interface ClimateProps {
  derived: Derived | null;
  frame: Telemetry | null;
}

interface MotionProps {
  derived: Derived | null;
  frame: Telemetry | null;
  stats: Stats;
  live: boolean;
  attitudeSettings: AttitudeSettings;
  onTareLevel: () => void;
  onResetTareLevel: () => void;
  onUpdateSettings: (patch: Partial<AttitudeSettings>) => void;
}

export function ClimateCard({ derived, frame }: ClimateProps) {
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

export function MotionCard({
  derived,
  frame,
  stats,
  live,
  attitudeSettings,
  onTareLevel,
  onResetTareLevel,
  onUpdateSettings,
}: MotionProps) {
  const attitude = derived?.attitude ?? null;
  const roll = attitude?.roll ?? null;
  const pitch = attitude?.pitch ?? null;
  const tilt = attitude?.tilt ?? null;
  const vibration = derived?.vibration ?? 0;
  const shock = stats.peakShock;

  const cycleMount = () => {
    const nextMount =
      attitudeSettings.mount === 'auto'
        ? 'inverted'
        : attitudeSettings.mount === 'inverted'
          ? 'upright'
          : 'auto';
    onUpdateSettings({ mount: nextMount });
  };

  return (
    <section className="panel panel--sensor">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Motion</p>
          <h2>Wagon attitude</h2>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {attitude?.inverted && (
            <span className="tag tag--sky" title="Underside mount detected or active (Z-axis pointing down)">
              UNDERSIDE MOUNT
            </span>
          )}
          {attitude?.isTared && (
            <span className="tag tag--teal" title="Attitude level calibrated">
              TARED
            </span>
          )}
          <span className="tag tag--teal">MPU6050</span>
        </div>
      </header>

      <div className="motion">
        <AttitudeDial roll={roll} pitch={pitch} />
        <dl className="motion__grid">
          <div>
            <dt>Roll</dt>
            <dd>{roll === null ? '—' : `${roll > 0 ? '+' : ''}${fmt(roll, 1)}°`}</dd>
            {attitude?.rollDirection && <span className="motion__dir">{attitude.rollDirection}</span>}
          </div>
          <div>
            <dt>Pitch</dt>
            <dd>{pitch === null ? '—' : `${pitch > 0 ? '+' : ''}${fmt(pitch, 1)}°`}</dd>
            {attitude?.pitchDirection && <span className="motion__dir">{attitude.pitchDirection}</span>}
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

      <div className="motion__actions">
        <button
          type="button"
          className="btn btn--ghost btn--tiny"
          onClick={onTareLevel}
          title="Zero out current angles and set the wagon as 0° level on the ground"
          disabled={frame?.az == null}
        >
          Tare level (Zero)
        </button>
        {attitude?.isTared && (
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={onResetTareLevel}
            title="Clear level tare offset"
          >
            Reset
          </button>
        )}
        <button
          type="button"
          className={`btn btn--ghost btn--tiny ${attitudeSettings.mount !== 'auto' ? 'is-active' : ''}`}
          onClick={cycleMount}
          title="Toggle mounting orientation: Auto (detects Z-down), Inverted (underside), Upright (top)"
        >
          Mount: {attitudeSettings.mount}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--tiny ${attitudeSettings.longitudinalAxis !== 'x' ? 'is-active' : ''}`}
          onClick={() =>
            onUpdateSettings({
              longitudinalAxis: attitudeSettings.longitudinalAxis === 'x' ? 'y' : 'x',
            })
          }
          title="Toggle which sensor axis is along the wagon base: X (beside load cell) or Y"
        >
          Axis: {attitudeSettings.longitudinalAxis.toUpperCase()}-Base
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--tiny ${attitudeSettings.invertRoll ? 'is-active' : ''}`}
          onClick={() => onUpdateSettings({ invertRoll: !attitudeSettings.invertRoll })}
          title="Invert roll direction (side-to-side lean)"
        >
          {attitudeSettings.invertRoll ? 'Roll: Inv' : 'Roll: Norm'}
        </button>
        <button
          type="button"
          className={`btn btn--ghost btn--tiny ${attitudeSettings.invertPitch ? 'is-active' : ''}`}
          onClick={() => onUpdateSettings({ invertPitch: !attitudeSettings.invertPitch })}
          title="Invert pitch direction (fore-aft tilt along base)"
        >
          {attitudeSettings.invertPitch ? 'Pitch: Inv' : 'Pitch: Norm'}
        </button>
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
          accel x {fmt(frame.ax, 2)} (base) · y {fmt(frame.ay, 2)} (cross) · z {fmt(frame.az, 2)} g
          {attitude?.inverted ? ' · (z inverted)' : ''}
        </p>
      )}
    </section>
  );
}
