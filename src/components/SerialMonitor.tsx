import { useEffect, useRef, useState } from 'react';
import { clockTime } from '../lib/format';
import type { ConsoleLine } from '../lib/telemetry';

export function SerialMonitor({ lines }: { lines: ConsoleLine[] }) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines, open]);

  const last = lines[lines.length - 1];

  return (
    <section className={`console ${open ? 'is-open' : ''}`}>
      <button type="button" className="console__head" onClick={() => setOpen((value) => !value)}>
        <span className="console__title">Serial monitor</span>
        <span className="console__last">{last?.text ?? 'no traffic yet'}</span>
        <span className="console__count">{lines.length}</span>
        <span className="console__chev">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="console__body" ref={bodyRef}>
          {lines.length === 0 && <p className="console__empty">Nothing received yet.</p>}
          {lines.map((line) => (
            <div key={line.id} className={`console__line console__line--${line.dir}`}>
              <span className="console__time">{clockTime(line.at)}</span>
              <b>{line.dir === 'rx' ? '←' : line.dir === 'tx' ? '→' : '·'}</b>
              <code>{line.text}</code>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
