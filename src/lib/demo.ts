/**
 * Demo telemetry source.
 *
 * It emits the exact same JSON lines the ESP32 sends, so the parser, the
 * derived metrics, the alerts and the 3D view all get exercised without
 * hardware. One 40 s cycle: idle -> loading -> hold -> unload.
 */

const TICK_MS = 200;
const CYCLE_MS = 40_000;

type Emit = (line: string) => void;

export class DemoSource {
  private timer: number | null = null;
  private startedAt = 0;
  private weight = 0;
  private lastTick = 0;
  private tc = 28.4;
  private rh = 58;
  private nextClimate = 0;
  private lastBump = 0;
  private bumpSeed = 1;

  start(emit: Emit): void {
    this.stop();
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
    this.weight = 0;
    this.tc = 28.4;
    this.rh = 58;
    this.nextClimate = this.startedAt;
    this.lastBump = this.startedAt + 3200;

    emit(JSON.stringify({ type: 'hello', fw: 'demo-1.1', cal: 1.0, demo: true }));

    this.timer = window.setInterval(() => this.tick(emit, performance.now()), TICK_MS);
    this.tick(emit, this.startedAt);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  private tick(emit: Emit, now: number): void {
    const elapsed = now - this.startedAt;
    const dt = Math.min(1, (now - this.lastTick) / 1000);
    this.lastTick = now;

    const phase = elapsed % CYCLE_MS;
    const target = 500;
    let rate = 0;
    if (phase < 3000) rate = 0;
    else if (phase < 21_000) rate = 28;
    else if (phase < 29_000) rate = 0;
    else rate = -42;

    this.weight = Math.max(0, this.weight + rate * dt);
    if (this.weight > target * 1.06) this.weight = target * 1.06;

    const noise = (Math.random() - 0.5) * 1.6;
    const grams = Math.max(0, this.weight + noise);

    // Attitude: slow sway, plus an off-level lean during the unload phase.
    const swayRoll = Math.sin(elapsed / 2900) * 2.4;
    const swayPitch = Math.cos(elapsed / 4100) * 1.3;
    let lean = 0;
    const leanStart = 30_500;
    const leanEnd = 35_000;
    if (phase > leanStart && phase < leanEnd) {
      const t = (phase - leanStart) / (leanEnd - leanStart);
      lean = Math.sin(Math.PI * t) * 20;
    }

    // Vertical shock every few seconds: a coupling bang, not a tilt.
    let bump = 0;
    if (now > this.lastBump) {
      this.lastBump = now + 8000 + Math.random() * 5000;
      this.bumpSeed = now;
    }
    const sinceBump = now - this.bumpSeed;
    if (sinceBump < 600) {
      bump = Math.exp(-sinceBump / 140) * Math.cos(sinceBump / 30) * 0.45;
    }

    const az = 1 + (Math.random() - 0.5) * 0.02 + bump;
    const rollDeg = swayRoll + lean;
    const ax = Math.tan((rollDeg * Math.PI) / 180) * az + (Math.random() - 0.5) * 0.012;
    const ay = Math.tan((swayPitch * Math.PI) / 180) * az + (Math.random() - 0.5) * 0.012;

    if (now >= this.nextClimate) {
      this.nextClimate = now + 2600;
      this.tc = 28 + Math.sin(elapsed / 24_000) * 1.8 + Math.random() * 0.3;
      this.rh = 58 + Math.sin(elapsed / 31_000) * 6 + Math.random() * 0.6;
    }

    const raw = Math.round(700_000 + grams * 431.7);
    emit(
      JSON.stringify({
        type: 'ww',
        ms: Math.round(elapsed),
        w: Number(grams.toFixed(2)),
        raw,
        ax: Number(ax.toFixed(3)),
        ay: Number(ay.toFixed(3)),
        az: Number(az.toFixed(3)),
        tc: Number(this.tc.toFixed(1)),
        rh: Number(this.rh.toFixed(0)),
        ok: { hx: true, mpu: true, dht: true },
      }),
    );
  }
}
