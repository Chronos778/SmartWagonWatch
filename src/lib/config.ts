/** Shared constants and bench limits for the WagonWatch dashboard. */

export const CONFIG = {
  /** Serial speed must match Serial.begin() in the firmware. */
  baudRate: 115200,

  /** Model + scene tuning. */
  model: {
    url: '/models/wagon.glb',
    /**
     * Node names to hide, matched loosely. The assembly is shown complete —
     * including the load-cell link between body and bogie — so this is only
     * for genuinely stray CAD leftovers.
     */
    hiddenNodes: [] as string[],
    /** Target length of the wagon in scene units. */
    lengthInScene: 4.4,
  },

  /** Default bench limits (grams of model weight). Editable in the UI. */
  limits: {
    targetGrams: 500,
    maxGrams: 560,
  },

  /** How much history the charts keep. */
  historySeconds: 180,

  /** Payload of a full-scale wagon, used to show a scaled (not measured) tonnage. */
  realWagonTonnes: 70,

  /** Stop considering telemetry "live" after this gap. */
  staleAfterMs: 3000,
} as const;
