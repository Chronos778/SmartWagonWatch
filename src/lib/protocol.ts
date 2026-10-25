/**
 * Wire protocol for WagonWatch.
 *
 * The firmware prints one JSON object per line at ~5 Hz:
 *   {"type":"ww","ms":12345,"w":183.4,"raw":812345,"ax":0.02,"ay":-0.01,"az":1.00,
 *    "tc":28.4,"rh":61,"ok":{"hx":true,"mpu":true,"dht":true}}
 *
 * `w` is payload in grams (already tared), `raw` is the raw HX711 count,
 * `ax/ay/az` are accelerometer g, `tc` is degC and `rh` is %RH.
 * Unavailable readings arrive as null.
 */

export interface Telemetry {
  /** millis() from the ESP32. */
  ms: number;
  /** Payload weight in grams (null if the load cell is unavailable). */
  w: number | null;
  /** Raw HX711 counts. */
  raw: number | null;
  /** Accelerometer, g. */
  ax: number | null;
  ay: number | null;
  az: number | null;
  /** DHT11 readings. */
  tc: number | null;
  rh: number | null;
  ok: { hx: boolean; mpu: boolean; dht: boolean };
}

export type ParsedLine =
  | { kind: 'telemetry'; frame: Telemetry }
  | { kind: 'hello'; fw: string | null; cal: number | null; text: string }
  | { kind: 'ack'; text: string }
  | { kind: 'console'; text: string };

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Reads one line from the ESP32 and classifies it. */
export function parseLine(line: string): ParsedLine {
  const text = line.trim();
  if (!text) return { kind: 'console', text };

  // Newline-delimited telemetry.
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const type = typeof obj.type === 'string' ? obj.type : 'ww';

      if (type === 'hello') {
        return {
          kind: 'hello',
          fw: typeof obj.fw === 'string' ? obj.fw : null,
          cal: num(obj.cal),
          text,
        };
      }
      if (type === 'ack') {
        return { kind: 'ack', text: typeof obj.msg === 'string' ? obj.msg : text };
      }

      const ok = (obj.ok ?? {}) as Record<string, unknown>;
      const w = num(obj.w);
      return {
        kind: 'telemetry',
        frame: {
          ms: num(obj.ms) ?? 0,
          w,
          raw: num(obj.raw),
          ax: num(obj.ax),
          ay: num(obj.ay),
          az: num(obj.az),
          tc: num(obj.tc),
          rh: num(obj.rh),
          // Presence of a value is a good default when the flag is absent.
          ok: {
            hx: bool(ok.hx, w !== null),
            mpu: bool(ok.mpu, num(obj.az) !== null),
            dht: bool(ok.dht, num(obj.tc) !== null),
          },
        },
      };
    } catch {
      return { kind: 'console', text };
    }
  }

  // Human-readable firmware that predates the JSON protocol:
  // LOAD raw:812345 chg:1234 183.4g | DHT 28.0C 61% | MPU 0.02 -0.01 1.00 g
  const legacy = text.match(
    /^LOAD raw:(-?\d+) chg:(-?\d+) (\S+?)g \| DHT (\S+?)C (\S+?)% \| MPU (\S+) (\S+) (\S+) g$/,
  );
  if (legacy) {
    const [, raw, , grams, tc, rh, ax, ay, az] = legacy;
    return {
      kind: 'telemetry',
      frame: {
        ms: 0,
        w: num(Number(grams)),
        raw: num(Number(raw)),
        ax: num(Number(ax)),
        ay: num(Number(ay)),
        az: num(Number(az)),
        tc: num(Number(tc)),
        rh: num(Number(rh)),
        ok: { hx: true, mpu: true, dht: true },
      },
    };
  }

  return { kind: 'console', text };
}

/** Commands accepted by the firmware, in plain text lines. */
export const COMMANDS = {
  tare: 'TARE\n',
  calibrate: (grams: number) => `CAL ${grams.toFixed(2)}\n`,
};
