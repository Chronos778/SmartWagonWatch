import { useEffect, useState } from 'react';
import { clockTime } from '../lib/format';
import type { LinkState, Stats } from '../lib/telemetry';

interface Props {
  link: LinkState;
  stats: Stats;
  ageMs: number | null;
  serialAvailable: boolean;
  demoRunning: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleDemo: () => void;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  idle: { label: 'Not connected', tone: 'idle' },
  connecting: { label: 'Opening port', tone: 'warn' },
  live: { label: 'Live', tone: 'ok' },
  demo: { label: 'Demo telemetry', tone: 'warn' },
  closed: { label: 'Disconnected', tone: 'idle' },
  error: { label: 'Link error', tone: 'danger' },
};

export function Header({
  link,
  stats,
  ageMs,
  serialAvailable,
  demoRunning,
  onConnect,
  onDisconnect,
  onToggleDemo,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stale = (link.status === 'live' || link.status === 'demo') && (ageMs === null || ageMs > 3000);
  const status = stale ? { label: 'No telemetry', tone: 'warn' } : (STATUS[link.status] ?? STATUS.idle);
  const detail = stale
    ? 'device stopped sending — check USB and power'
    : (link.message ??
      (link.status === 'live'
        ? `${link.portLabel ?? 'serial'} · 115200 baud`
        : link.status === 'demo'
          ? 'synthetic frames, 5 Hz'
          : 'plug in the wagon'));

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <path d="M6 12h28v15H6z" />
            <path d="M6 20h28" />
            <circle cx="13" cy="31" r="3" />
            <circle cx="27" cy="31" r="3" />
          </svg>
        </span>
        <div>
          <h1>
            Wagon<span>Watch</span>
          </h1>
          <p>Live payload &amp; attitude telemetry · PS-1313</p>
        </div>
      </div>

      <div className="topbar__meta">
        <div className={`status status--${status.tone}`}>
          <span className="status__dot" />
          <div className="status__text">
            <strong>{status.label}</strong>
            <span>{detail}</span>
          </div>
        </div>

        <div className="topbar__stat">
          <span>Packets</span>
          <strong>{stats.packets.toLocaleString()}</strong>
        </div>
        <div className="topbar__stat">
          <span>Data age</span>
          <strong>{ageMs === null ? '—' : `${(ageMs / 1000).toFixed(1)} s`}</strong>
        </div>
        <div className="topbar__stat topbar__stat--clock">
          <span>Local</span>
          <strong>{clockTime(now)}</strong>
        </div>
      </div>

      <div className="topbar__actions">
        {link.status === 'live' ? (
          <button type="button" className="btn btn--ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onConnect}
            disabled={link.status === 'connecting'}
            title={serialAvailable ? 'Pick the ESP32 serial port' : 'Web Serial needs Chrome or Edge'}
          >
            <span className="btn__dot" />
            Connect ESP32
          </button>
        )}
        <button type="button" className={`btn btn--ghost ${demoRunning ? 'is-active' : ''}`} onClick={onToggleDemo}>
          {demoRunning ? 'Stop demo' : 'Demo data'}
        </button>
      </div>
    </header>
  );
}
