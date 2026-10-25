/**
 * Maths that turns raw sensor readings into the numbers shown on screen.
 *
 * Mounting: MPU6050 sits with X along the base of the wagon (beside the load cell),
 * Y across the wagon (lateral), and Z vertical (auto-inverted if underside mounted).
 */

export interface Attitude {
  /** Side-to-side lean, degrees (+ = sensor side down). Measured across wagon (Y axis). */
  roll: number;
  /** Fore/aft tilt, degrees (+ = front down). Measured along wagon base (X axis). */
  pitch: number;
  /** Total angle away from level, degrees. */
  tilt: number;
  /** Whether inverted Z (underside mount) is active. */
  inverted?: boolean;
  /** Whether level calibration (tare) is active. */
  isTared?: boolean;
  /** Raw roll before tare offset, degrees. */
  rawRoll?: number;
  /** Raw pitch before tare offset, degrees. */
  rawPitch?: number;
}

export interface AttitudeSettings {
  /**
   * Mounting orientation:
   * - 'auto': Automatically detect underside mounting when az is negative
   * - 'inverted': Always treat as underside mount (invert Z)
   * - 'upright': Standard top mount (Z up)
   */
  mount: 'auto' | 'upright' | 'inverted';
  /** Invert roll axis (side-to-side lean across wagon). */
  invertRoll?: boolean;
  /** Invert pitch axis (fore-aft tilt along base). */
  invertPitch?: boolean;
  /** Legacy alias for invertPitch. */
  invertX?: boolean;
  /** Legacy alias for invertRoll. */
  invertY?: boolean;
  /** Roll offset in degrees when wagon is on level ground. */
  tareRoll: number;
  /** Pitch offset in degrees when wagon is on level ground. */
  tarePitch: number;
}

export const DEFAULT_ATTITUDE_SETTINGS: AttitudeSettings = {
  mount: 'auto',
  invertRoll: false,
  invertPitch: false,
  tareRoll: 0,
  tarePitch: 0,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const RAD = 180 / Math.PI;

export function attitude(
  ax: number | null,
  ay: number | null,
  az: number | null,
  settings?: Partial<AttitudeSettings>,
): Attitude | null {
  if (ax === null || ay === null || az === null) return null;
  const magnitude = Math.hypot(ax, ay, az);
  if (!Number.isFinite(magnitude) || magnitude < 0.2) return null;

  const mount = settings?.mount ?? 'auto';
  // When mounted on the wagon underside or upside-down, gravity support points in -Z direction (az ~ -1 g).
  const isInverted = mount === 'inverted' || (mount === 'auto' && az < -0.3);

  const azEff = isInverted ? -az : az;
  // X is along the wagon base (beside load cell); Y is across the wagon.
  const invP = Boolean(settings?.invertPitch || settings?.invertX);
  const invR = Boolean(settings?.invertRoll || settings?.invertY);
  const axEff = invP ? -ax : ax;
  const ayEff = invR ? -ay : ay;

  // X along wagon base measures fore/aft pitch; Y across wagon measures side-to-side roll.
  const rawPitch = Math.atan2(axEff, azEff) * RAD;
  const rawRoll = Math.atan2(ayEff, azEff) * RAD;

  const tareRoll = settings?.tareRoll ?? 0;
  const tarePitch = settings?.tarePitch ?? 0;
  const isTared = Math.abs(tareRoll) > 0.001 || Math.abs(tarePitch) > 0.001;

  const roll = rawRoll - tareRoll;
  const pitch = rawPitch - tarePitch;

  // When tared to ground level, tilt measures deviation from that level reference.
  const rawTilt = Math.acos(Math.min(1, Math.max(-1, azEff / magnitude))) * RAD;
  const tilt = isTared ? Math.hypot(roll, pitch) : rawTilt;

  return { roll, pitch, tilt, inverted: isInverted, isTared, rawRoll, rawPitch };
}

/** Split the accelerometer into gravity + vibration, and track a rolling RMS. */
export class ShockMeter {
  private gravity: Vec3 = { x: 0, y: 0, z: 1 };
  private rms = 0;
  private initialized = false;
  peak = 0;
  peakAt = 0;

  update(ax: number, ay: number, az: number, now: number): { shock: number; rms: number } {
    const sample = { x: ax, y: ay, z: az };
    if (!this.initialized) {
      this.gravity = { ...sample };
      this.initialized = true;
    }
    const alpha = 0.08;
    this.gravity.x += (sample.x - this.gravity.x) * alpha;
    this.gravity.y += (sample.y - this.gravity.y) * alpha;
    this.gravity.z += (sample.z - this.gravity.z) * alpha;

    const shock = Math.hypot(
      sample.x - this.gravity.x,
      sample.y - this.gravity.y,
      sample.z - this.gravity.z,
    );
    this.rms = this.rms * 0.9 + shock * 0.1;
    if (shock > this.peak) {
      this.peak = shock;
      this.peakAt = now;
    }
    return { shock, rms: this.rms };
  }

  reset(): void {
    this.rms = 0;
    this.peak = 0;
    this.initialized = false;
    this.gravity = { x: 0, y: 0, z: 1 };
  }
}

export interface WeightPoint {
  t: number;
  v: number;
}

/**
 * Least-squares slope of the payload over the last `windowMs`, in grams per minute.
 * Returns null when there is not enough data or no meaningful trend.
 */
export function loadRate(points: WeightPoint[], windowMs = 8000): number | null {
  if (points.length < 4) return null;
  const cutoff = points[points.length - 1].t - windowMs;
  const window = points.filter((p) => p.t >= cutoff);
  if (window.length < 4) return null;

  const n = window.length;
  let sumT = 0;
  let sumV = 0;
  for (const p of window) {
    sumT += p.t;
    sumV += p.v;
  }
  const meanT = sumT / n;
  const meanV = sumV / n;

  let num = 0;
  let den = 0;
  for (const p of window) {
    const dt = p.t - meanT;
    num += dt * (p.v - meanV);
    den += dt * dt;
  }
  if (den === 0) return null;
  return (num / den) * 60_000;
}

/** 0–100 ride quality index from tilt and vibration. Inputs: degrees and g. */
export function stabilityIndex(attitudeValue: Attitude | null, vibration: number): number {
  const tilt = attitudeValue?.tilt ?? 0;
  const score = 100 - Math.min(55, tilt * 3.2) - Math.min(45, vibration * 260);
  return Math.max(0, Math.min(100, score));
}

export type Level = 'info' | 'warn' | 'critical';

export interface ClimateReading {
  level: Level | 'nominal';
  label: string;
  note: string;
}

/**
 * Coal self-heating watch. Freshly loaded coal is warm, and damp cargo can
 * self-heat; the DHT11 gives us a coarse but real signal.
 */
export function climateRisk(tc: number | null, rh: number | null): ClimateReading {
  if (tc === null && rh === null) {
    return { level: 'nominal', label: 'No reading', note: 'DHT11 has not reported yet' };
  }
  if (tc !== null && tc >= 50) {
    return { level: 'critical', label: 'Hot cargo', note: 'Above 50 °C — self-heating risk' };
  }
  if (tc !== null && tc >= 40) {
    return { level: 'warn', label: 'Heat watch', note: 'Above 40 °C — monitor the wagon' };
  }
  if (rh !== null && rh >= 85) {
    return { level: 'warn', label: 'Damp', note: 'Above 85 %RH — condensation risk' };
  }
  return { level: 'nominal', label: 'Nominal', note: 'Temperature and humidity in range' };
}

/** Difference in percent, guarded against division by zero. */
export function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return value / total;
}
