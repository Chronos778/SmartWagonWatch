import { clockTime } from '../lib/format';
import type { AlertItem } from '../lib/telemetry';

interface Props {
  alerts: AlertItem[];
  onClear: () => void;
}

export function AlertLog({ alerts, onClear }: Props) {
  const criticalCount = alerts.filter((alert) => alert.level === 'critical').length;

  return (
    <section className="panel panel--alerts">
      <header className="panel__head">
        <div>
          <p className="eyebrow">Alerts</p>
          <h2>
            Event log
            {alerts.length > 0 && (
              <span className={`count ${criticalCount > 0 ? 'count--danger' : ''}`}>{alerts.length}</span>
            )}
          </h2>
        </div>
        <button type="button" className="btn btn--tiny" onClick={onClear} disabled={alerts.length === 0}>
          Clear
        </button>
      </header>

      <div className="alerts">
        {alerts.length === 0 ? (
          <div className="alerts__empty">
            <span className="alerts__check">✓</span>
            <p>All nominal</p>
            <span>Overload, impacts, tilt and load loss will appear here.</span>
          </div>
        ) : (
          <ul>
            {alerts.map((alert) => (
              <li key={alert.id} className={`alert alert--${alert.level}`}>
                <span className="alert__dot" />
                <div>
                  <div className="alert__top">
                    <strong>{alert.title}</strong>
                    <time>{clockTime(alert.at)}</time>
                  </div>
                  <p>{alert.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
