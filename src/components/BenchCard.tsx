import { useState } from 'react';
import { duration, fmt } from '../lib/format';
import type { LinkState, Stats } from '../lib/telemetry';

interface Props {
  stats: Stats;
  link: LinkState;
  onTare: () => void;
  onCalibrate: (grams: number) => void;
}

export function BenchCard({ stats, link, onTare, onCalibrate }: Props) {
  const [calibration, setCalibration] = useState('180');
  const serial = link.status === 'live';
  const uptime = stats.startedAt ? (Date.now() - stats.startedAt) / 1000 : null;

  return (
    <section className="panel panel--bench">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Bench</p>
          <h2>Zero &amp; calibrate</h2>
        </div>
        <span className={`tag ${serial ? 'tag--teal' : ''}`}>{serial ? 'SERIAL' : 'OFFLINE'}</span>
      </header>

      <div className="bench__actions">
        <button type="button" className="btn btn--ghost btn--wide" onClick={onTare} disabled={!serial}>
          Tare (zero)
        </button>
        <div className="bench__cal">
          <input
            type="number"
            min={10}
            step={10}
            value={calibration}
            onChange={(event) => setCalibration(event.target.value)}
            aria-label="Known weight in grams"
          />
          <span>g</span>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onCalibrate(Number(calibration))}
            disabled={!serial || !Number(calibration)}
          >
            Calibrate
          </button>
        </div>
      </div>
      <p className="bench__note">
        Place the known weight on the cell, then calibrate. The factor is stored on the ESP32.
      </p>

      <dl className="session">
        <div>
          <dt>Uptime</dt>
          <dd>{duration(uptime)}</dd>
        </div>
        <div>
          <dt>Packets</dt>
          <dd>{stats.packets.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Peak load</dt>
          <dd>{fmt(stats.peakGrams, 1)} g</dd>
        </div>
        <div>
          <dt>Port</dt>
          <dd className="session__port">{link.portLabel ?? '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
