import { useEffect, useMemo, useState } from 'react';
import { AlertLog } from './components/AlertLog';
import { BenchCard } from './components/BenchCard';
import { Header } from './components/Header';
import { Metrics } from './components/Metrics';
import { PayloadCard } from './components/PayloadCard';
import { ScenePanel } from './components/ScenePanel';
import { ClimateCard, MotionCard } from './components/Sensors';
import { SerialMonitor } from './components/SerialMonitor';
import { TrendChart } from './components/TrendChart';
import { CONFIG } from './lib/config';
import { useTelemetry, type Limits } from './lib/telemetry';

const LIMITS_KEY = 'wagonwatch.limits.v1';

function loadLimits(): Limits {
  try {
    const raw = window.localStorage.getItem(LIMITS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Limits>;
      if (typeof parsed.target === 'number' && typeof parsed.max === 'number' && parsed.max > parsed.target) {
        return { target: parsed.target, max: parsed.max };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { target: CONFIG.limits.targetGrams, max: CONFIG.limits.maxGrams };
}

export function App() {
  const [limits, setLimits] = useState<Limits>(loadLimits);
  const { snapshot, actions, serialAvailable } = useTelemetry(limits);

  useEffect(() => {
    window.localStorage.setItem(LIMITS_KEY, JSON.stringify(limits));
  }, [limits]);

  const demoRunning = snapshot.link.status === 'demo';
  const live = snapshot.live;
  const trendWindow = useMemo(() => CONFIG.historySeconds, []);

  return (
    <div className="app">
      <Header
        link={snapshot.link}
        stats={snapshot.stats}
        ageMs={snapshot.ageMs}
        serialAvailable={serialAvailable}
        demoRunning={demoRunning}
        onConnect={() => void actions.connect()}
        onDisconnect={() => void actions.disconnect()}
        onToggleDemo={actions.toggleDemo}
      />

      {!serialAvailable && (
        <p className="banner">
          Web Serial is not available in this browser. Use Chrome or Edge on a desktop over
          <code>localhost</code> or <code>https</code> — or press <strong>Demo data</strong> to explore the dashboard.
        </p>
      )}

      <main className="board">
        <div className="board__col board__col--left">
          <PayloadCard
            derived={snapshot.derived}
            limits={limits}
            onLimits={setLimits}
            live={live}
            targetTonnes={CONFIG.realWagonTonnes}
          />

          <section className="panel panel--trend">
            <header className="panel__head">
              <div>
                <p className="eyebrow">History</p>
                <h2>Payload trend</h2>
              </div>
              <span className="tag">{trendWindow / 60} MIN</span>
            </header>
            <TrendChart
              history={snapshot.history}
              target={limits.target}
              max={limits.max}
              windowSeconds={trendWindow}
            />
          </section>

          <BenchCard
            stats={snapshot.stats}
            link={snapshot.link}
            onTare={actions.tare}
            onCalibrate={actions.calibrate}
            onTareLevel={actions.tareLevel}
            onResetTareLevel={actions.resetTareLevel}
            isLevelTared={snapshot.derived?.attitude?.isTared}
          />
        </div>

        <div className="board__col board__col--center">
          <ScenePanel derived={snapshot.derived} live={live} onDemo={actions.toggleDemo} />
          <Metrics derived={snapshot.derived} stats={snapshot.stats} limits={limits} live={live} />
        </div>

        <div className="board__col board__col--right">
          <ClimateCard derived={snapshot.derived} frame={snapshot.frame} />
          <MotionCard
            derived={snapshot.derived}
            frame={snapshot.frame}
            stats={snapshot.stats}
            live={live}
            attitudeSettings={snapshot.attitudeSettings}
            onTareLevel={actions.tareLevel}
            onResetTareLevel={actions.resetTareLevel}
            onUpdateSettings={actions.updateAttitudeSettings}
          />
          <AlertLog alerts={snapshot.alerts} onClear={actions.clearAlerts} />
        </div>
      </main>

      <SerialMonitor lines={snapshot.console} />

      <footer className="honesty">
        <span>Scale model · one load cell reads total payload, not per-bogie corner</span>
        <span>·</span>
        <span>Tonnes are scaled from the target payload ({CONFIG.realWagonTonnes} t reference)</span>
        <span>·</span>
        <span>Camera, GPS and OLED are not part of this build</span>
      </footer>
    </div>
  );
}
