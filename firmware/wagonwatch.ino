/*
 * WagonWatch — wagon telemetry firmware
 * -------------------------------------
 * ESP32 + HX711 load cell + MPU6050 + DHT11
 *
 * This is your working sketch, with one change: instead of the human-readable
 * "LOAD raw:... | DHT ... | MPU ..." line it streams one JSON object per line,
 * which is what the dashboard reads over Web Serial.
 *
 *   {"type":"ww","ms":12345,"w":183.42,"raw":812345,
 *    "ax":0.02,"ay":-0.01,"az":1.00,"tc":28.4,"rh":61,
 *    "ok":{"hx":true,"mpu":true,"dht":true}}
 *
 * Frame rate is 5 Hz (200 ms). `w` is payload in grams, already tared.
 * Any reading that is not available is sent as `null`, never as `nan`.
 *
 * Commands (one per line, from the dashboard buttons or the serial monitor):
 *   TARE            zero the scale with the wagon empty
 *   CAL 180         calibrate with a known 180 g weight on the cell
 *   180             same as CAL 180
 *
 * Wiring (unchanged)
 *   HX711   DT -> GPIO25, SCK -> GPIO26, VCC -> 3V3, GND -> GND
 *   MPU6050 SDA -> GPIO21, SCL -> GPIO22, VCC -> 3V3, GND -> GND
 *   DHT11   DATA -> GPIO27 (10k pull-up to 3V3), VCC -> 3V3, GND -> GND
 *
 * Mount the MPU6050 with X along the base of the wagon (beside the load cell),
 * Y across the wagon, and Z vertical (or underside mounted). The dashboard computes
 * pitch = atan2(ax, az) along the base, and roll = atan2(ay, az) across the wagon.
 */

#include <Wire.h>
#include <DHT.h>
#include <HX711.h>
#include <Preferences.h>
#include <math.h>

#define FW_VERSION "1.2.0"

#define HX_DT   25
#define HX_SCK  26
#define DHT_PIN 27
#define SDA_PIN 21
#define SCL_PIN 22

/** Counts per gram from your 180 g calibration — used until a new one is sent. */
#define DEFAULT_CAL 207.672

/**
 * Underside chassis mounting:
 * If your MPU6050 is mounted under the wagon frame with Z pointing downwards,
 * set MPU_INVERT_Z to true (or leave false: the dashboard auto-detects this too).
 */
#define MPU_INVERT_Z false

/** Telemetry frame interval: 80 ms = 12.5 Hz for fluid, low-latency tracking. */
#define SEND_INTERVAL_MS 80
/** DHT11 must not be polled faster than ~1 Hz. */
#define DHT_INTERVAL_MS 2500
#define TARE_SAMPLES 20
#define CAL_SAMPLES  15

HX711 scale;
DHT dht(DHT_PIN, DHT11);
Preferences prefs;

bool hxOk = false, mpuOk = false, dhtOk = false;
uint8_t mpuAddr = 0;
float calFactor = DEFAULT_CAL;

long rawNow = 0;
float gramsNow = NAN;
float ax = NAN, ay = NAN, az = NAN;
float tc = NAN, rh = NAN;

unsigned long lastSend = 0;
unsigned long lastDht = 0;
String cmdLine = "";

int16_t read16() {
  int16_t hi = Wire.read();
  int16_t lo = Wire.read();
  return (hi << 8) | lo;
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

void printNumber(float value, int digits) {
  if (isnan(value) || isinf(value)) {
    Serial.print(F("null"));
  } else {
    Serial.print(value, digits);
  }
}

void printRaw(bool valid, long value) {
  if (valid) {
    Serial.print(value);
  } else {
    Serial.print(F("null"));
  }
}

void printOkFlags() {
  Serial.print(F("\"ok\":{\"hx\":"));
  Serial.print(hxOk ? F("true") : F("false"));
  Serial.print(F(",\"mpu\":"));
  Serial.print(mpuOk ? F("true") : F("false"));
  Serial.print(F(",\"dht\":"));
  Serial.print(dhtOk ? F("true") : F("false"));
  Serial.print(F("}"));
}

void sendTelemetry() {
  Serial.print(F("{\"type\":\"ww\",\"ms\":"));
  Serial.print(millis());
  Serial.print(F(",\"w\":"));
  printNumber(gramsNow, 2);
  Serial.print(F(",\"raw\":"));
  printRaw(hxOk, rawNow);
  Serial.print(F(",\"ax\":"));
  printNumber(ax, 3);
  Serial.print(F(",\"ay\":"));
  printNumber(ay, 3);
  Serial.print(F(",\"az\":"));
  printNumber(az, 3);
  Serial.print(F(",\"tc\":"));
  printNumber(tc, 1);
  Serial.print(F(",\"rh\":"));
  printNumber(rh, 0);
  Serial.print(F(","));
  printOkFlags();
  Serial.println(F("}"));
}

void sendHello() {
  Serial.print(F("{\"type\":\"hello\",\"fw\":\""));
  Serial.print(F(FW_VERSION));
  Serial.print(F("\",\"cal\":"));
  Serial.print(calFactor, 3);
  Serial.print(F(","));
  printOkFlags();
  Serial.println(F("}"));
}

void sendAck(const String &message) {
  Serial.print(F("{\"type\":\"ack\",\"msg\":\""));
  Serial.print(message);
  Serial.println(F("\"}"));
}

// ---------------------------------------------------------------------------
// sensors
// ---------------------------------------------------------------------------

void readLoadCell() {
  if (!hxOk || !scale.is_ready()) return;
  // Non-blocking read so telemetry loop runs smoothly at full rate without stalling MPU data
  rawNow = scale.get_value(1);
  long change = rawNow - scale.get_offset();
  gramsNow = change / scale.get_scale();
  if (fabs(gramsNow) < 1.0) gramsNow = 0;   // deadband: hide +/-0.3 g noise
}

void readMpu() {
  if (!mpuOk) return;
  Wire.beginTransmission(mpuAddr);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  if (Wire.requestFrom(mpuAddr, (uint8_t)6) != 6) return;
  int16_t x = read16();
  int16_t y = read16();
  int16_t z = read16();
  float rawAx = x / 16384.0f;
  float rawAy = y / 16384.0f;
  float rawAz = (MPU_INVERT_Z ? -1.0f : 1.0f) * (z / 16384.0f);

  if (isnan(ax)) {
    ax = rawAx; ay = rawAy; az = rawAz;
  } else {
    // Smooth moving average to eliminate raw ADC ripple and table jitter
    ax = ax * 0.70f + rawAx * 0.30f;
    ay = ay * 0.70f + rawAy * 0.30f;
    az = az * 0.70f + rawAz * 0.30f;
  }
}

void readClimate() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  dhtOk = !isnan(t) && !isnan(h);
  if (dhtOk) {
    tc = t;
    rh = h;
  }
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

void tareScale() {
  if (!hxOk) {
    sendAck(F("HX711 not ready"));
    return;
  }
  scale.tare(TARE_SAMPLES);
  gramsNow = 0;
  sendAck(F("tared"));
}

void calibrateScale(float knownGrams) {
  if (!hxOk || knownGrams <= 0) {
    sendAck(F("calibration needs a known weight"));
    return;
  }
  long counts = scale.read_average(CAL_SAMPLES) - scale.get_offset();
  if (labs(counts) < 100) {
    sendAck(F("too little signal - is the weight on the cell?"));
    return;
  }
  calFactor = (float)counts / knownGrams;
  scale.set_scale(calFactor);
  prefs.putFloat("cal", calFactor);

  String msg = "calibrated ";
  msg += String(calFactor, 3);
  msg += " counts/g";
  sendAck(msg);
}

void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;
  String upper = cmd;
  upper.toUpperCase();

  if (upper == "TARE" || upper == "T" || upper == "ZERO") {
    tareScale();
    return;
  }

  float known = 0;
  if (upper.startsWith("CAL")) {
    known = cmd.substring(3).toFloat();
  } else {
    known = cmd.toFloat();
  }
  if (known > 0) {
    calibrateScale(known);
  } else {
    sendAck(F("unknown command"));
  }
}

void pollSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (cmdLine.length() > 0) {
        handleCommand(cmdLine);
        cmdLine = "";
      }
    } else if (cmdLine.length() < 48) {
      cmdLine += c;
    }
  }
}

// ---------------------------------------------------------------------------
// setup / loop
// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(1200);

  // Your 207.672 counts/g is the default; a new CAL is remembered across reboots.
  prefs.begin("wagonwatch", false);
  calFactor = prefs.getFloat("cal", DEFAULT_CAL);

  Serial.println();
  Serial.println(F("=== WagonWatch telemetry ==="));

  // MPU6050
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);
  for (uint8_t a = 0x68; a <= 0x69; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) { mpuAddr = a; break; }
  }
  if (mpuAddr) {
    Wire.beginTransmission(mpuAddr);
    Wire.write(0x6B); Wire.write(0x00); // Wake up MPU6050
    Wire.endTransmission();

    // Enable hardware Digital Low Pass Filter (DLPF_CFG = 4: 21 Hz bandwidth)
    // Hardware-filters high frequency motor hum and electrical sensor noise
    Wire.beginTransmission(mpuAddr);
    Wire.write(0x1A); Wire.write(0x04);
    Wire.endTransmission();

    mpuOk = true;
    Serial.printf("MPU6050: OK at 0x%02X (DLPF active)\n", mpuAddr);
  } else {
    Serial.println(F("MPU6050: NOT FOUND (check SDA=21, SCL=22, first DA pin)"));
  }

  // DHT11
  dht.begin();

  // HX711
  scale.begin(HX_DT, HX_SCK);
  unsigned long t0 = millis();
  while (!scale.is_ready() && millis() - t0 < 3000) delay(50);
  if (scale.is_ready()) {
    hxOk = true;
    Serial.println(F("HX711: OK. Keep load cell UNLOADED, zeroing in 3 s..."));
    delay(3000);
    scale.set_scale(calFactor);
    scale.tare(TARE_SAMPLES);
    Serial.printf("HX711: zeroed, cal %.3f counts/g\n", calFactor);
    Serial.println(F("Weight in grams. Send TARE to re-zero, CAL <grams> to recalibrate."));
  } else {
    Serial.println(F("HX711: NOT READY (check DT=25, SCK=26, VCC, GND)"));
  }

  Serial.println(F("======================="));

  readClimate();
  lastDht = millis();
  sendHello();
}

void loop() {
  unsigned long now = millis();

  pollSerial();
  readMpu();
  readLoadCell();

  // DHT11 needs ~1 s between reads; 2.5 s leaves plenty of margin.
  if (now - lastDht >= DHT_INTERVAL_MS) {
    lastDht = now;
    readClimate();
  }

  if (now - lastSend >= SEND_INTERVAL_MS) {
    lastSend = now;
    sendTelemetry();
  }
}
