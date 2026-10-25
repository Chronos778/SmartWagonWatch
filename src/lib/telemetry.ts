import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { DemoSource } from './demo';
import {
  ShockMeter,
  attitude,
  climateRisk,
  loadRate,
  stabilityIndex,
  type Attitude,
  type AttitudeSettings,
  DEFAULT_ATTITUDE_SETTINGS,
  type ClimateReading,
  type Level,
} from './derive';
import { COMMANDS, parseLine, type Telemetry } from './protocol';
import { SerialLink, type LinkStatus } from './serial';

export interface Limits {
  target: number;
  max: number;
}

export interface Sample {
  t: number;
  v: number;
}

export interface AlertItem {
  id: number;
  at: number;
  level: Level;
  title: string;
  detail: string;
}

export type ConsoleDir = 'rx' | 'tx' | 'sys';

export interface ConsoleLine {
  id: number;
  at: number;
  dir: ConsoleDir;
  text: string;
}

export interface LinkState {
  status: LinkStatus | 'demo';
  portLabel: string | null;
  message: string | null;
  source: 'serial' | 'demo' | null;
}

export interface Stats {
  packets: number;
  startedAt: number | null;
  lastAt: number | null;
  peakGrams: number;
  peakShock: number;
  impacts: number;
  maxTilt: number;
}

export type Tone = 'idle' | 'ok' | 'warn' | 'danger';

export interface Verdict {
  tone: Tone;
  label: string;
  detail: string;
}

export interface Derived {
  grams: number | null;
  kg: number | null;
  tonnes: number | null;
  pctTarget: number;
  pctMax: number;
  toTarget: number | null;
  toMax: number | null;
  ratePerMin: number | null;
  etaSeconds: number | null;
  attitude: Attitude | null;
  shock: number;
  vibration: number;
  stability: number | null;
  climate: ClimateReading;
  verdict: Verdict;
  trend: 'rising' | 'falling' | 'steady';
}

export interface Snapshot {
  link: LinkState;
  frame: Telemetry | null;
  ageMs: number | null;
  live: boolean;
  stats: Stats;
  derived: Derived | null;
  alerts: AlertItem[];
  history: Sample[];
  console: ConsoleLine[];
  attitudeSettings: AttitudeSettings;
}

const EMPTY_STATS: Stats = {
  packets: 0,
  startedAt: null,
  lastAt: null,
  peakGrams: 0,
  peakShock: 0,
  impacts: 0,
  maxTilt: 0,
};

/** Accelerations above this count as a shock event. */
const IMPACT_G = 0.35;
/** Weight lost within this window that looks like load theft. */
const DROP_WINDOW_MS = 3500;

function verdictFor(grams: number | null, limits: Limits, live: boolean): Verdict {
  if (grams === null) {
    return { tone: 'idle', label: 'No load reading', detail: 'Waiting for the load cell' };
  }
  if (!live) {
    return {
      tone: 'warn',
      label: 'Telemetry stale',
      detail: 'Last packet is older than the link timeout',
    };
  }
  if (grams > limits.max) {
    return {
      tone: 'danger',
      label: 'Overload',
      detail: `${(grams - limits.max).toFixed(1)} g above the ${limits.max} g limit — penalty zone`,
    };
  }
  if (grams >= limits.target) {
    return {
      tone: 'ok',
      label: 'On target',
      detail: `${(limits.max - grams).toFixed(1)} g of headroom left before the limit`,
    };
  }
  if (grams <= 1) {
    return { tone: 'idle', label: 'Ready to load', detail: 'Wagon is empty and tared' };
  }
  const pct = (grams / limits.target) * 100;
  return {
    tone: 'warn',
    label: 'Under-loaded',
    detail: `${(limits.target - grams).toFixed(1)} g (${(100 - pct).toFixed(0)}%) short of target`,
  };
}

const ATTITUDE_KEY = 'wagonwatch.attitude.v1';

function loadAttitudeSettings(): AttitudeSettings {
  try {
    const raw = window.localStorage.getItem(ATTITUDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AttitudeSettings>;
      return {
        mount:
          parsed.mount === 'inverted' || parsed.mount === 'upright' || parsed.mount === 'auto'
            ? parsed.mount
            : 'auto',
        longitudinalAxis: parsed.longitudinalAxis === 'y' ? 'y' : 'x',
        invertRoll: Boolean(parsed.invertRoll ?? parsed.invertY),
        invertPitch: Boolean(parsed.invertPitch ?? parsed.invertX),
        tareRoll: typeof parsed.tareRoll === 'number' ? parsed.tareRoll : 0,
        tarePitch: typeof parsed.tarePitch === 'number' ? parsed.tarePitch : 0,
      };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_ATTITUDE_SETTINGS;
}

export function useTelemetry(limits: Limits) {
  const initialAttitude = loadAttitudeSettings();
  const [attitudeSettings, setAttitudeSettingsState] = useState<AttitudeSettings>(initialAttitude);
  const attitudeSettingsRef = useRef<AttitudeSettings>(initialAttitude);
  attitudeSettingsRef.current = attitudeSettings;

  const [snapshot, setSnapshot] = useState<Snapshot>({
    link: { status: 'idle', portLabel: null, message: null, source: null },
    frame: null,
    ageMs: null,
    live: false,
    stats: EMPTY_STATS,
    derived: null,
    alerts: [],
    history: [],
    console: [],
    attitudeSettings: initialAttitude,
  });

  const limitsRef = useRef(limits);
  limitsRef.current = limits;

  const serialRef = useRef<SerialLink | null>(null);
  const demoRef = useRef<DemoSource | null>(null);
  const frameRef = useRef<Telemetry | null>(null);
  const historyRef = useRef<Sample[]>([]);
  const alertRef = useRef<AlertItem[]>([]);
  const consoleRef = useRef<ConsoleLine[]>([]);
  const statsRef = useRef<Stats>({ ...EMPTY_STATS });
  const shockRef = useRef(new ShockMeter());
  const vibrationRef = useRef(0);
  /** Low-passed accelerometer. A bump is a shock, not a tilt. */
  const accelRef = useRef({ x: 0, y: 0, z: 1, ready: false });
  const cooldownRef = useRef(new Map<string, number>());
  const idRef = useRef(1);
  const inImpactRef = useRef(false);
  const linkRef = useRef<LinkState>({
    status: 'idle',
    portLabel: null,
    message: null,
    source: null,
  });

  const pushConsole = useCallback((dir: ConsoleDir, text: string) => {
    consoleRef.current = [
      ...consoleRef.current,
      { id: idRef.current++, at: Date.now(), dir, text: text.slice(0, 400) },
    ].slice(-200);
  }, []);

  const raise = useCallback(
    (code: string, level: Level, title: string, detail: string, cooldownMs = 20_000) => {
      const now = Date.now();
      const last = cooldownRef.current.get(code) ?? 0;
      if (now - last < cooldownMs) return;
      cooldownRef.current.set(code, now);
      alertRef.current = [
        { id: idRef.current++, at: now, level, title, detail },
        ...alertRef.current,
      ].slice(0, 60);
      pushConsole('sys', `${level === 'critical' ? '!!' : '!'} ${title} — ${detail}`);
    },
    [pushConsole],
  );

  const publish = useCallback(() => {
    const frame = frameRef.current;
    const now = Date.now();
    const lastAt = statsRef.current.lastAt;
    const ageMs = lastAt === null ? null : now - lastAt;
    const live = ageMs !== null && ageMs < CONFIG.staleAfterMs;
    const limitsNow = limitsRef.current;

    let derived: Derived | null = null;
    if (frame) {
      const grams = frame.w;
      const filtered = accelRef.current;
      const att = filtered.ready
        ? attitude(filtered.x, filtered.y, filtered.z, attitudeSettingsRef.current)
        : null;
      const history = historyRef.current;
      const rate = grams === null ? null : loadRate(history.slice(-60));
      let eta: number | null = null;
      if (rate !== null && grams !== null && rate > 0.5) {
        eta = Math.max(0, ((limitsNow.target - grams) / rate) * 60);
      }
      derived = {
        grams,
        kg: grams === null ? null : grams / 1000,
        tonnes: grams === null ? null : (grams / limitsNow.target) * CONFIG.realWagonTonnes,
        pctTarget: grams === null ? 0 : (grams / limitsNow.target) * 100,
        pctMax: grams === null ? 0 : (grams / limitsNow.max) * 100,
        toTarget: grams === null ? null : limitsNow.target - grams,
        toMax: grams === null ? null : limitsNow.max - grams,
        ratePerMin: rate,
        etaSeconds: eta,
        attitude: att,
        shock: shockRef.current.peak,
        vibration: vibrationRef.current,
        stability: att ? stabilityIndex(att, vibrationRef.current) : null,
        climate: climateRisk(frame.tc, frame.rh),
        verdict: verdictFor(grams, limitsNow, live || linkRef.current.source === 'demo'),
        trend: rate === null ? 'steady' : rate > 3 ? 'rising' : rate < -3 ? 'falling' : 'steady',
      };
    }

    setSnapshot({
      link: linkRef.current,
      frame,
      ageMs,
      live,
      stats: { ...statsRef.current },
      derived,
      alerts: alertRef.current,
      history: historyRef.current,
      console: consoleRef.current,
      attitudeSettings: attitudeSettingsRef.current,
    });
  }, []);

  const handleFrame = useCallback(
    (frame: Telemetry) => {
      const now = Date.now();
      const stats = statsRef.current;
      const limitsNow = limitsRef.current;

      stats.packets += 1;
      stats.lastAt = now;
      stats.startedAt ??= now;
      frameRef.current = frame;

      if (frame.w !== null) {
        const history = historyRef.current;
        history.push({ t: now, v: frame.w });
        const cutoff = now - CONFIG.historySeconds * 1000;
        while (history.length && history[0].t < cutoff) history.shift();
        stats.peakGrams = Math.max(stats.peakGrams, frame.w);
      }

      if (frame.ax !== null && frame.ay !== null && frame.az !== null) {
        const accel = accelRef.current;
        if (!accel.ready) {
          accel.x = frame.ax;
          accel.y = frame.ay;
          accel.z = frame.az;
          accel.ready = true;
        } else {
          // 3D vector distance between incoming sensor reading and current filtered attitude vector
          const dx = frame.ax - accel.x;
          const dy = frame.ay - accel.y;
          const dz = frame.az - accel.z;
          const dist = Math.hypot(dx, dy, dz);

          // Adaptive dual-regime noise filter:
          // 1. Resting state: Raw MPU6050 electrical ADC ripple is typically 0.015 - 0.035 g.
          //    Under 0.025 g, the wagon is completely stationary -> deadband locks attitude rock-solid.
          // 2. Slow subtle tilt: 0.025 - 0.06 g -> gentle smooth convergence (no jump).
          // 3. Fast physical hand tilt: > 0.06 g -> dynamic scaling up to alpha = 0.82 for instant 1:1 response.
          let alpha = 0;
          if (dist > 0.06) {
            // Fast tracking for real-life hand movement
            alpha = Math.min(0.82, 0.45 + (dist - 0.06) * 1.6);
          } else if (dist > 0.025) {
            // Gentle smooth tracking without jerking
            alpha = 0.12;
          }

          if (alpha > 0) {
            accel.x += dx * alpha;
            accel.y += dy * alpha;
            accel.z += dz * alpha;
          }
        }
      }

      const filtered = accelRef.current;
      const att = filtered.ready
        ? attitude(filtered.x, filtered.y, filtered.z, attitudeSettingsRef.current)
        : null;
      if (att) {
        // Reset old historical maxTilt if it was poisoned by the previous 180° inverted mount reading
        if (stats.maxTilt > 90) {
          stats.maxTilt = att.tilt;
        } else {
          stats.maxTilt = Math.max(stats.maxTilt, att.tilt);
        }
        if (att.tilt > 12) {
          raise(
            'tilt',
            att.tilt > 20 ? 'critical' : 'warn',
            att.tilt > 20 ? 'Wagon leaning hard' : 'Wagon off level',
            `Tilt ${att.tilt.toFixed(1)}° — roll ${att.roll.toFixed(1)}°, pitch ${att.pitch.toFixed(1)}°`,
            20_000,
          );
        }
      }

      if (frame.ax !== null && frame.ay !== null && frame.az !== null) {
        const { shock, rms } = shockRef.current.update(frame.ax, frame.ay, frame.az, now);
        vibrationRef.current = rms;
        stats.peakShock = Math.max(stats.peakShock, shock);
        if (shock > IMPACT_G && !inImpactRef.current) {
          inImpactRef.current = true;
          stats.impacts += 1;
          raise(
            'impact',
            shock > 0.8 ? 'critical' : 'warn',
            shock > 0.8 ? 'Hard impact' : 'Rough handling',
            `${shock.toFixed(2)} g shock on the wagon body — check coupling or loading`,
            15_000,
          );
        } else if (shock < IMPACT_G * 0.4) {
          inImpactRef.current = false;
        }
      }

      if (frame.w !== null && historyRef.current.length > 2) {
        const history = historyRef.current;
        const recent = history.find((s) => now - s.t <= DROP_WINDOW_MS);
        if (recent && recent.v - frame.w > Math.max(20, limitsNow.target * 0.08)) {
          raise(
            'drop',
            'critical',
            'Sudden load loss',
            `Payload fell ${(recent.v - frame.w).toFixed(1)} g in under 4 s — possible theft or spill`,
            15_000,
          );
        }
      }

      if (frame.w !== null && frame.w > limitsNow.max) {
        raise(
          'overload',
          'critical',
          'Overload',
          `${(frame.w - limitsNow.max).toFixed(1)} g above the ${limitsNow.max} g limit — Railways penalty risk`,
          10_000,
        );
      } else if (frame.w !== null && frame.w >= limitsNow.target) {
        raise(
          'target',
          'info',
          'Target payload reached',
          `${frame.w.toFixed(1)} g loaded — stop loading to stay clear of the limit`,
          60_000,
        );
      }

      if (frame.tc !== null && frame.tc >= 40) {
        raise(
          'heat',
          frame.tc >= 50 ? 'critical' : 'warn',
          frame.tc >= 50 ? 'Coal running hot' : 'Cargo heating up',
          `${frame.tc.toFixed(1)} °C inside the wagon (${frame.rh?.toFixed(0) ?? '—'} %RH)`,
          120_000,
        );
      }

      if (frame.rh !== null && frame.rh >= 85) {
        raise('humidity', 'warn', 'High humidity', `${frame.rh.toFixed(0)} %RH — condensation risk`, 180_000);
      }

      if (!frame.ok.hx) raise('hx', 'warn', 'Load cell offline', 'HX711 is not reporting — check DT/SCK wiring', 60_000);
      if (!frame.ok.mpu) raise('mpu', 'warn', 'IMU offline', 'MPU6050 is not reporting — check SDA/SCL', 60_000);

      publish();
    },
    [publish, raise],
  );

  const handleLine = useCallback(
    (line: string) => {
      const parsed = parseLine(line);
      if (parsed.kind === 'telemetry') {
        handleFrame(parsed.frame);
        return;
      }
      if (parsed.kind === 'console' && !parsed.text) return;
      if (parsed.kind === 'hello') {
        pushConsole('sys', `Device online${parsed.fw ? ` · ${parsed.fw}` : ''}${parsed.cal !== null ? ` · cal ${parsed.cal.toFixed(3)}` : ''}`);
        pushConsole('rx', parsed.text);
        publish();
        return;
      }
      if (parsed.kind === 'ack') {
        pushConsole('sys', `Device: ${parsed.text}`);
        publish();
        return;
      }
      pushConsole('rx', parsed.text);
      publish();
    },
    [handleFrame, publish, pushConsole],
  );

  const setLink = useCallback(
    (patch: Partial<LinkState>) => {
      linkRef.current = { ...linkRef.current, ...patch };
      publish();
    },
    [publish],
  );

  const connect = useCallback(async () => {
    if (!SerialLink.supported) {
      setLink({
        status: 'error',
        message: 'Web Serial is unavailable. Use Chrome or Edge on desktop, served over localhost or https.',
      });
      return;
    }
    demoRef.current?.stop();
    const link = new SerialLink();
    serialRef.current = link;
    setLink({ status: 'connecting', source: 'serial', portLabel: null, message: null });
    try {
      await link.connect(CONFIG.baudRate, {
        onLine: handleLine,
        onUpdate: (update) => {
          if (update.status === 'live') {
            pushConsole('sys', `Connected · ${update.portLabel ?? 'serial'} · ${CONFIG.baudRate} baud`);
            setLink({
              status: 'live',
              portLabel: update.portLabel ?? null,
              message: null,
              source: 'serial',
            });
          } else if (update.status === 'closed') {
            pushConsole('sys', update.message ?? 'Disconnected');
            if (linkRef.current.source === 'serial') setLink({ status: 'closed', message: update.message ?? null });
          } else if (update.status === 'error') {
            pushConsole('sys', update.message ?? 'Serial error');
            setLink({ status: 'error', message: update.message ?? 'Serial error' });
          }
        },
      });
      pushConsole('sys', 'Port opened. Listening for telemetry…');
      publish();
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      let friendly = raw;
      if (/No port selected|cancel/i.test(raw)) {
        friendly = 'No serial port was selected.';
      } else if (/Failed to open serial port/i.test(raw)) {
        friendly = 'Port busy: close Arduino Serial Monitor or other browser tabs, or unplug/replug the USB cable.';
      }
      pushConsole('sys', friendly);
      setLink({ status: 'error', message: friendly });
    }
  }, [handleLine, publish, pushConsole, setLink]);

  const disconnect = useCallback(async () => {
    const link = serialRef.current;
    serialRef.current = null;
    if (link) {
      await link.disconnect({
        onLine: () => {},
        onUpdate: () => {},
      });
    }
    pushConsole('sys', 'Disconnected');
    setLink({ status: 'closed', portLabel: null, message: null });
  }, [pushConsole, setLink]);

  const toggleDemo = useCallback(() => {
    if (demoRef.current?.running) {
      demoRef.current.stop();
      demoRef.current = null;
      frameRef.current = null;
      historyRef.current = [];
      statsRef.current = { ...EMPTY_STATS };
      shockRef.current.reset();
      vibrationRef.current = 0;
      accelRef.current = { x: 0, y: 0, z: 1, ready: false };
      alertRef.current = [];
      cooldownRef.current.clear();
      pushConsole('sys', 'Demo stopped');
      setLink({ status: 'idle', source: null });
      publish();
      return;
    }
    void disconnect();
    const demo = new DemoSource();
    demoRef.current = demo;
    frameRef.current = null;
    historyRef.current = [];
    statsRef.current = { ...EMPTY_STATS };
    shockRef.current.reset();
    vibrationRef.current = 0;
    accelRef.current = { x: 0, y: 0, z: 1, ready: false };
    alertRef.current = [];
    cooldownRef.current.clear();
    pushConsole('sys', 'Demo mode — synthetic telemetry, no hardware');
    setLink({ status: 'demo', source: 'demo', portLabel: 'DEMO', message: null });
    demo.start(handleLine);
    publish();
  }, [disconnect, handleLine, publish, pushConsole, setLink]);

  const sendCommand = useCallback(
    async (text: string, label: string) => {
      pushConsole('tx', label);
      const link = serialRef.current;
      if (!link) {
        pushConsole('sys', 'Commands need a serial connection (demo mode is read-only).');
        publish();
        return;
      }
      try {
        await link.send(text);
      } catch (error) {
        pushConsole('sys', error instanceof Error ? error.message : 'Write failed');
      }
      publish();
    },
    [publish, pushConsole],
  );

  const tare = useCallback(() => sendCommand(COMMANDS.tare, 'TARE'), [sendCommand]);
  const calibrate = useCallback(
    (grams: number) => sendCommand(COMMANDS.calibrate(grams), `CAL ${grams.toFixed(2)} g`),
    [sendCommand],
  );

  const clearAlerts = useCallback(() => {
    alertRef.current = [];
    publish();
  }, [publish]);

  const tareLevel = useCallback(() => {
    const filtered = accelRef.current;
    if (!filtered.ready) return;
    const settings = attitudeSettingsRef.current;
    const rawAtt = attitude(filtered.x, filtered.y, filtered.z, {
      ...settings,
      tareRoll: 0,
      tarePitch: 0,
    });
    if (!rawAtt) return;

    const newSettings: AttitudeSettings = {
      ...settings,
      tareRoll: rawAtt.rawRoll ?? rawAtt.roll,
      tarePitch: rawAtt.rawPitch ?? rawAtt.pitch,
    };
    attitudeSettingsRef.current = newSettings;
    setAttitudeSettingsState(newSettings);
    try {
      window.localStorage.setItem(ATTITUDE_KEY, JSON.stringify(newSettings));
    } catch {
      /* ignore */
    }

    statsRef.current.maxTilt = 0;
    alertRef.current = alertRef.current.filter(
      (a) => !a.title.includes('Wagon leaning') && !a.title.includes('Wagon off level'),
    );
    pushConsole(
      'sys',
      `Level calibrated: roll ${(rawAtt.rawRoll ?? 0).toFixed(1)}°, pitch ${(rawAtt.rawPitch ?? 0).toFixed(1)}° zeroed`,
    );
    publish();
  }, [publish, pushConsole]);

  const resetTareLevel = useCallback(() => {
    const settings = attitudeSettingsRef.current;
    const newSettings: AttitudeSettings = {
      ...settings,
      tareRoll: 0,
      tarePitch: 0,
    };
    attitudeSettingsRef.current = newSettings;
    setAttitudeSettingsState(newSettings);
    try {
      window.localStorage.setItem(ATTITUDE_KEY, JSON.stringify(newSettings));
    } catch {
      /* ignore */
    }
    statsRef.current.maxTilt = 0;
    pushConsole('sys', 'Level tare reset to raw sensor orientation');
    publish();
  }, [publish, pushConsole]);

  const updateAttitudeSettings = useCallback(
    (patch: Partial<AttitudeSettings>) => {
      const current = attitudeSettingsRef.current;
      const updated: AttitudeSettings = { ...current, ...patch };
      attitudeSettingsRef.current = updated;
      setAttitudeSettingsState(updated);
      try {
        window.localStorage.setItem(ATTITUDE_KEY, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      statsRef.current.maxTilt = 0;
      alertRef.current = alertRef.current.filter(
        (a) => !a.title.includes('Wagon leaning') && !a.title.includes('Wagon off level'),
      );
      publish();
    },
    [publish],
  );

  // Keep the link age / live flag fresh even when packets stop arriving.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const lastAt = statsRef.current.lastAt;
      if (lastAt !== null && Date.now() - lastAt >= CONFIG.staleAfterMs) {
        const stale = linkRef.current.status === 'live' || linkRef.current.status === 'demo';
        if (stale) {
          raise(
            'stale',
            linkRef.current.status === 'demo' ? 'warn' : 'critical',
            'Telemetry stopped',
            'No packets for more than 3 s — check the USB cable and the firmware loop',
            30_000,
          );
        }
      }
      if (frameRef.current || statsRef.current.lastAt !== null) publish();
    }, 500);
    return () => window.clearInterval(timer);
  }, [publish, raise]);

  useEffect(() => {
    return () => {
      demoRef.current?.stop();
      void serialRef.current?.disconnect({ onLine: () => {}, onUpdate: () => {} });
    };
  }, []);

  return {
    snapshot,
    actions: {
      connect,
      disconnect,
      toggleDemo,
      tare,
      calibrate,
      clearAlerts,
      tareLevel,
      resetTareLevel,
      updateAttitudeSettings,
    },
    serialAvailable: SerialLink.supported,
  };
}
