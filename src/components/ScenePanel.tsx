import type { AttitudeSettings } from '../lib/derive';
import type { Derived } from '../lib/telemetry';
import { fmt } from '../lib/format';
import { WagonScene } from './WagonScene';

interface Props {
  derived: Derived | null;
  live: boolean;
  onDemo: () => void;
  attitudeSettings: AttitudeSettings;
  onTareLevel: () => void;
  onResetTareLevel: () => void;
  onUpdateSettings: (patch: Partial<AttitudeSettings>) => void;
}

export function ScenePanel({
  derived,
  live,
  onDemo,
  attitudeSettings,
  onTareLevel,
  onResetTareLevel,
  onUpdateSettings,
}: Props) {
  const loadFraction = Math.max(0, Math.min(1.15, (derived?.pctMax ?? 0) / 100));
  const overloaded = (derived?.verdict.tone ?? 'idle') === 'danger';
  const showEmpty = !live && (derived?.grams ?? null) === null;
  const attitude = derived?.attitude ?? null;
  const roll = attitude?.roll ?? null;
  const pitch = attitude?.pitch ?? null;
  const tilt = attitude?.tilt ?? null;

  return (
    <section className="panel panel--scene">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Digital twin</p>
          <h2>Wagon attitude · live</h2>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {attitude?.inverted && (
            <span className="tag tag--sky" title="Underside mount detected (Z-axis pointing down)">
              UNDERSIDE MOUNT
            </span>
          )}
          {attitude?.isTared && (
            <span className="tag tag--teal" title="Attitude level calibrated to ground">
              TARED LEVEL
            </span>
          )}
          <span className={`tag ${live ? 'tag--teal' : ''}`}>MPU6050 DRIVEN</span>
        </div>
      </header>

      <div className="scene-wrap">
        <WagonScene
          attitude={derived?.attitude ?? null}
          loadFraction={loadFraction}
          overloaded={overloaded}
          vibration={derived?.vibration ?? 0}
        />

        <div className="scene__load">
          <div className="scene__load-track">
            <span
              className={overloaded ? 'is-over' : ''}
              style={{ height: `${Math.max(2, Math.min(100, loadFraction * 100))}%` }}
            />
          </div>
          <div className="scene__load-meta">
            <strong>{derived ? `${fmt(derived.pctMax, 0)}%` : '—'}</strong>
            <span>of limit</span>
          </div>
        </div>

        <div className="scene__readout">
          <div className="scene__readout-item">
            <span>Roll</span>
            <strong>{roll === null ? '—' : `${roll > 0 ? '+' : ''}${fmt(roll, 1)}°`}</strong>
            {attitude?.rollDirection && <small>{attitude.rollDirection}</small>}
          </div>
          <div className="scene__readout-item">
            <span>Pitch</span>
            <strong>{pitch === null ? '—' : `${pitch > 0 ? '+' : ''}${fmt(pitch, 1)}°`}</strong>
            {attitude?.pitchDirection && <small>{attitude.pitchDirection}</small>}
          </div>
          <div className="scene__readout-item">
            <span>Tilt</span>
            <strong>{tilt === null ? '—' : `${fmt(tilt, 1)}°`}</strong>
            <small>{attitude?.isTared ? 'zero ref' : 'absolute'}</small>
          </div>
        </div>

        <div className="scene__controls">
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={onTareLevel}
            title="Set current physical ground position as 0° level"
          >
            Tare level (Zero)
          </button>
          {attitude?.isTared && (
            <button
              type="button"
              className="btn btn--ghost btn--tiny"
              onClick={onResetTareLevel}
              title="Reset level tare calibration"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            className={`btn btn--ghost btn--tiny ${attitudeSettings.invertPitch ? 'is-active' : ''}`}
            onClick={() => onUpdateSettings({ invertPitch: !attitudeSettings.invertPitch })}
            title="Invert pitch direction (front-up vs front-down)"
          >
            Pitch: {attitudeSettings.invertPitch ? 'Inv' : 'Norm'}
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--tiny ${attitudeSettings.invertRoll ? 'is-active' : ''}`}
            onClick={() => onUpdateSettings({ invertRoll: !attitudeSettings.invertRoll })}
            title="Invert roll direction (left-lean vs right-lean)"
          >
            Roll: {attitudeSettings.invertRoll ? 'Inv' : 'Norm'}
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--tiny ${attitudeSettings.longitudinalAxis !== 'x' ? 'is-active' : ''}`}
            onClick={() =>
              onUpdateSettings({
                longitudinalAxis: attitudeSettings.longitudinalAxis === 'x' ? 'y' : 'x',
              })
            }
            title="Toggle base axis: X (beside load cell) or Y"
          >
            Axis: {attitudeSettings.longitudinalAxis.toUpperCase()}-Base
          </button>
          <button
            type="button"
            className={`btn btn--ghost btn--tiny ${attitudeSettings.mount !== 'auto' ? 'is-active' : ''}`}
            onClick={() => {
              const next =
                attitudeSettings.mount === 'auto'
                  ? 'inverted'
                  : attitudeSettings.mount === 'inverted'
                    ? 'upright'
                    : 'auto';
              onUpdateSettings({ mount: next });
            }}
            title="Toggle mount mode"
          >
            Mount: {attitudeSettings.mount}
          </button>
        </div>

        <div className="scene__hint">drag to orbit · scroll to zoom</div>

        {showEmpty && (
          <div className="scene__empty">
            <p className="eyebrow">Bring the wagon online</p>
            <ol>
              <li>Flash <code>firmware/wagonwatch.ino</code></li>
              <li>Plug the ESP32 in over USB</li>
              <li>Hit <strong>Connect ESP32</strong> and pick the COM port</li>
            </ol>
            <button type="button" className="btn btn--primary btn--sm" onClick={onDemo}>
              Watch it with demo data
            </button>
          </div>
        )}
      </div>

      <footer className="scene__foot">
        <span>Roll &amp; pitch come straight from the accelerometer · zero artificial shake</span>
        <span className="scene__foot-tag">scale model · digital twin</span>
      </footer>
    </section>
  );
}
