/**
 * Minimal Web Serial declarations (the API is not part of lib.dom).
 * Chrome / Edge only, and only in a secure context (http://localhost is fine).
 */

interface WagonWatchSerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface WagonWatchSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    bufferSize?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
  getInfo(): WagonWatchSerialPortInfo;
  forget?(): Promise<void>;
}

interface WagonWatchSerial extends EventTarget {
  requestPort(options?: {
    filters?: { usbVendorId?: number; usbProductId?: number }[];
  }): Promise<WagonWatchSerialPort>;
  getPorts(): Promise<WagonWatchSerialPort[]>;
}

interface Navigator {
  readonly serial?: WagonWatchSerial;
}
