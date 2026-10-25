import type { Derived } from '../lib/telemetry';
import { fmt } from '../lib/format';
import { WagonScene } from './WagonScene';

interface Props {
  derived: Derived | null;
  live: boolean;
  onDemo: () => void;
}

export function ScenePanel({ derived, live, onDemo }: Props) {
  const loadFraction = Math.max(0, Math.min(1.15, (derived?.pctMax ?? 0) / 100));
  const overloaded = (derived?.verdict.tone ?? 'idle') === 'danger';
  const showEmpty = !live && (derived?.grams ?? null) === null;

  return (
    <section className="panel panel--scene">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Digital twin</p>
          <h2>Wagon attitude · live</h2>
        </div>
        <span className={`tag ${live ? 'tag--teal' : ''}`}>MPU6050 DRIVEN</span>
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
        <span>Roll &amp; pitch come straight from the accelerometer</span>
        <span className="scene__foot-tag">scale model · tonnage is illustrative</span>
      </footer>
    </section>
  );
}
