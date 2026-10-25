/** Thin wrapper around the Web Serial API. Chrome and Edge only. */

export type LinkStatus = 'idle' | 'connecting' | 'live' | 'closed' | 'error';

export interface LinkUpdate {
  status: LinkStatus;
  portLabel?: string | null;
  message?: string;
}

export interface SerialCallbacks {
  onLine: (line: string) => void;
  onUpdate: (update: LinkUpdate) => void;
}

const VENDOR_NAMES: Record<number, string> = {
  0x10c4: 'CP210x',
  0x1a86: 'CH34x',
  0x0403: 'FTDI',
  0x2341: 'Arduino',
  0x303a: 'Espressif',
};

function describePort(port: WagonWatchSerialPort, index: number): string {
  const info = port.getInfo?.() ?? {};
  const vendor = info.usbVendorId ? VENDOR_NAMES[info.usbVendorId] : undefined;
  const id = info.usbVendorId
    ? `${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}:${(info.usbProductId ?? 0)
        .toString(16)
        .toUpperCase()
        .padStart(4, '0')}`
    : null;
  if (vendor && id) return `COM · ${vendor} (${id})`;
  if (id) return `Serial ${id}`;
  return `Serial port ${index + 1}`;
}

export class SerialLink {
  private port: WagonWatchSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = '';
  private stopping = false;
  private portLabel: string | null = null;

  get label(): string | null {
    return this.portLabel;
  }

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.serial?.requestPort === 'function';
  }

  async connect(baudRate: number, callbacks: SerialCallbacks): Promise<void> {
    if (!SerialLink.supported) {
      throw new Error(
        'This browser has no Web Serial support. Open the dashboard in Chrome or Edge on a desktop.',
      );
    }

    callbacks.onUpdate({ status: 'connecting' });
    const port = await navigator.serial!.requestPort();
    await port.open({ baudRate, bufferSize: 8192 });

    this.port = port;
    this.stopping = false;
    this.buffer = '';
    this.portLabel = describePort(port, 0);

    try {
      this.writer = port.writable ? port.writable.getWriter() : null;
    } catch {
      this.writer = null;
    }

    callbacks.onUpdate({ status: 'live', portLabel: this.portLabel });
    void this.readLoop(callbacks);
  }

  private async readLoop(callbacks: SerialCallbacks): Promise<void> {
    const port = this.port;
    if (!port?.readable) {
      callbacks.onUpdate({ status: 'error', message: 'Port has no readable stream.' });
      return;
    }

    const decoder = new TextDecoderStream();
    const readable = port.readable.pipeThrough(decoder as unknown as ReadableWritablePair<string, Uint8Array>);
    this.reader = readable.getReader();

    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.consume(value, callbacks);
      }
    } catch (error) {
      if (!this.stopping) {
        callbacks.onUpdate({
          status: 'error',
          message: error instanceof Error ? error.message : 'Serial link lost.',
        });
      }
    } finally {
      try {
        this.reader?.releaseLock();
      } catch {
        /* already released */
      }
      this.reader = null;
      if (!this.stopping) {
        this.stopping = true;
        await this.closePort();
        callbacks.onUpdate({ status: 'closed', message: 'Device disconnected.' });
      }
    }
  }

  private consume(chunk: string, callbacks: SerialCallbacks): void {
    this.buffer += chunk.replace(/\r/g, '');
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    // Guard against a device that never sends a newline.
    if (this.buffer.length > 4096) {
      callbacks.onLine(this.buffer);
      this.buffer = '';
    }
    for (const line of lines) callbacks.onLine(line);
  }

  async send(text: string): Promise<void> {
    if (!this.writer) throw new Error('Not connected to a serial port.');
    await this.writer.write(new TextEncoder().encode(text));
  }

  async disconnect(callbacks: SerialCallbacks): Promise<void> {
    this.stopping = true;
    try {
      await this.reader?.cancel();
    } catch {
      /* reader already gone */
    }
    try {
      this.reader?.releaseLock();
    } catch {
      /* already released */
    }
    this.reader = null;
    await this.closePort();
    callbacks.onUpdate({ status: 'closed', portLabel: null });
  }

  private async closePort(): Promise<void> {
    try {
      this.writer?.releaseLock();
    } catch {
      /* nothing to release */
    }
    this.writer = null;
    const port = this.port;
    this.port = null;
    this.portLabel = null;
    if (!port) return;
    try {
      await port.close();
    } catch {
      /* port can already be gone after a physical unplug */
    }
  }
}
