# WagonWatch — live wagon dashboard

WagonWatch puts the weighing system on the wagon itself: an ESP32 reads a load cell, an
MPU6050 and a DHT11, streams JSON over USB serial, and this dashboard turns it into a live
payload readout, a 3D wagon that leans with the real one, and a running alert log.

Built for **PS-1313** — coal-loaded railway wagons are filled by eye, so under-loading wastes
freight and overloading attracts penalties. Live weight feedback at the siding fixes both.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL in **Chrome or Edge** (Web Serial is Chromium-only) and either:

- **Connect ESP32** → pick the ESP32's COM port (115200 baud), or
- **Demo data** → synthetic frames, same wire format, no hardware.

The ESP32 must be running [`firmware/wagonwatch.ino`](firmware/wagonwatch.ino). Browsers only
expose serial ports on `localhost` or `https`, and Windows may need the CH340/CP210x USB driver
for the board's bridge chip.

## What the dashboard shows

| Panel | Data | Source |
| --- | --- | --- |
| Payload | weight, % of target, overload, trend | HX711 load cell |
| Digital twin | 3D wagon rolling/pitching with the accelerometer | MPU6050 |
| Cargo climate | temperature, humidity, heat/damp risk | DHT11 |
| Motion | roll, pitch, total tilt, vibration, peak shock, impacts | MPU6050 |
| Derived | loading rate, time-to-target, utilisation, ride index | computed |
| Event log | overload, impacts, tilt, sudden load loss, heat, sensor faults | rules |

The payload trend keeps three minutes of history. Target and overload limit are editable and
saved in the browser; the scaled tonnage assumes a 70 t wagon at the target payload.

### The maths worth knowing

- `roll = atan2(ax, az)`, `pitch = atan2(ay, az)`, `tilt = acos(az / |a|)` — after a low-pass
  filter, so a coupling bang does not read as a permanent lean.
- Vibration = RMS of the accelerometer minus its slow-moving gravity estimate; a sample over
  **0.35 g** counts as an impact.
- Loading rate is a least-squares slope over the last 8 s; time-to-target divides the remaining
  grams by that rate.
- Ride index = 100 − tilt and vibration penalties.
- Sudden load loss = more than `max(20 g, 8 % of target)` gone within 4 s — the in-transit theft
  / spill signal.

## Firmware

Libraries: **HX711** (bogde), **DHT sensor library** (Adafruit), plus `Wire` and `Preferences`
(both bundled with the ESP32 core). No MPU6050 library is needed — the sketch reads the
accelerometer registers directly.

| Sensor | Pin | Notes |
| --- | --- | --- |
| HX711 DT | GPIO25 | load cell amplifier |
| HX711 SCK | GPIO26 | |
| MPU6050 SDA | GPIO21 | I²C, address 0x68 or 0x69 |
| MPU6050 SCL | GPIO22 | |
| DHT11 DATA | GPIO27 | 10 kΩ pull-up to 3V3 |

Mount the MPU6050 with **X across the wagon, Y along the direction of travel, Z up** — that is
the axis convention the dashboard assumes. It tares on boot (cell must be empty) and stores the
calibration factor in NVS.

### Wire protocol

One JSON object per line, 5 Hz:

```json
{"type":"ww","ms":12345,"w":183.42,"raw":812345,"ax":0.02,"ay":-0.01,"az":1.00,
 "tc":28.4,"rh":61,"ok":{"hx":true,"mpu":true,"dht":true}}
```

| Field | Meaning |
| --- | --- |
| `w` | payload in grams, tared (null if unavailable) |
| `raw` | raw HX711 counts |
| `ax` `ay` `az` | accelerometer, g |
| `tc` | temperature, °C |
| `rh` | relative humidity, % |
| `ok` | per-sensor availability |

Boot banner: `{"type":"hello","fw":"1.2.0","cal":207.672,...}`. Commands are plain lines sent
from the dashboard's bench card: `TARE` to zero, `CAL 180` to calibrate with a known 180 g weight.
The sketch ships with your 207.672 counts/g factor and remembers any new one in NVS. Readings
below 1 g are reported as 0 to hide load-cell noise, and the DHT11 is polled every 2.5 s.

### Calibrating

1. Keep the cell unloaded, open the serial monitor — the sketch zeroes itself at boot.
2. Put a known weight on the cell, type the grams into **Bench → Calibrate**, press the button.
3. The acknowledgement shows `counts/g`; it is persisted, so a reboot keeps it.

## Project layout

```
firmware/wagonwatch.ino      ESP32 sketch: sensors -> JSON lines, tare/calibrate commands
src/lib/serial.ts            Web Serial transport (line buffered, auto-reconnect messaging)
src/lib/protocol.ts          line parser for JSON + the old human-readable format
src/lib/telemetry.ts         frame ingest, filters, alerts, session stats
src/lib/derive.ts            tilt/roll/pitch, shock, loading rate, ride index, climate risk
src/lib/demo.ts              synthetic 40 s load cycle through the same parser
src/components/WagonScene.tsx  three.js scene: GLB wagon, tilt, vibration, lights
src/components/…             panels, gauge, trend chart, attitude dial, alert log
public/models/wagon.glb      "Assembly 1" CAD export used by the 3D view
```

The CAD file is Z-up; the scene rotates it upright, auto-centres and scales it. The assembly is
shown complete — including the load-cell link between the body and the bogie. `hiddenNodes` in
`CONFIG.model` is the hook for hiding a genuinely stray part if the CAD ever exports one.

## Honest scope

- Scale model: **one load cell measures total weight**, not weight per bogie corner. Four cells
  and a per-corner balance view are the next step.
- Weights are bench grams; tonnage shown on screen is scaled from the target payload, not measured.
- Camera, GPS and the wagon OLED are not part of this build.
- The dashboard needs a Chromium browser for serial; everything else works offline after the
  first load (fonts fall back to system faces without a network).
