import test from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothDiagnostics, importServices, requestedServices, readBytes } from '../docs/core.mjs';

class Characteristic extends EventTarget {
  constructor(uuid, properties, values = [7]) { super(); Object.assign(this, { uuid, properties, values, writes: 0 }); }
  async readValue() { return new DataView(Uint8Array.from(this.values).buffer); }
  async startNotifications() { this.subscribed = true; return this; }
  notify(values) { this.value = new DataView(Uint8Array.from(values).buffer); this.dispatchEvent(new Event('characteristicvaluechanged')); }
}
function fixture({ timeoutMs = 100, services, chooseError } = {}) {
  const read = new Characteristic('read-char', { read: true }, [10, 20]);
  const events = new Characteristic('notify-char', { notify: true });
  const device = new EventTarget();
  device.name = 'Ai Friend Pro'; device.id = 'opaque-browser-id';
  const primary = services ?? [{ uuid: 'test-service', async getCharacteristics() { return [read, events]; } }];
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    async getPrimaryServices() { return primary; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
  };
  const bluetooth = {
    async requestDevice(options) { this.options = options; if (chooseError) throw chooseError; return device; },
  };
  const diagnostics = new BluetoothDiagnostics({ bluetooth, timeoutMs });
  return { diagnostics, device, read, events, bluetooth };
}

test('requests explicit services, reads values, and records notifications and user markers', async () => {
  const f = fixture();
  await f.diagnostics.connect('fff0');
  assert.equal(f.diagnostics.phase, 'observing');
  assert.ok(f.bluetooth.options.optionalServices.includes('0000fff0-0000-1000-8000-00805f9b34fb'));
  assert.equal(f.diagnostics.report.services[0].characteristics[0].value.hex, '0A14');
  f.events.notify([1, 2]);
  f.diagnostics.marker('Ativei ANC');
  assert.equal(f.diagnostics.notificationCount, 1);
  assert.match(f.diagnostics.text(), /Ativei ANC/);
  assert.match(f.diagnostics.json(), /0102/);
  f.diagnostics.disconnect();
  f.events.notify([3]);
  assert.equal(f.diagnostics.notificationCount, 1);
});

test('an inaccessible characteristic does not discard later services or the partial report', async () => {
  const denied = new Characteristic('blocked', { read: true });
  denied.readValue = async () => { throw new DOMException('Blocked by browser', 'SecurityError'); };
  const good = new Characteristic('battery', { read: true }, [80]);
  const { diagnostics } = fixture({ services: [{ uuid: 'service', async getCharacteristics() { return [denied, good]; } }] });
  await diagnostics.connect();
  assert.equal(diagnostics.report.services[0].characteristics[0].readError.name, 'SecurityError');
  assert.equal(diagnostics.report.services[0].characteristics[1].value.hex, '50');
  assert.equal(diagnostics.phase, 'observing');
  diagnostics.disconnect();
});

test('GATT operations remain sequential', async () => {
  let active = 0, maximum = 0;
  const values = [1, 2, 3].map(value => {
    const c = new Characteristic(`char-${value}`, { read: true });
    c.readValue = async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 3));
      active--; return new DataView(Uint8Array.of(value).buffer);
    };
    return c;
  });
  const { diagnostics } = fixture({ services: [{ uuid: 'service', async getCharacteristics() { return values; } }] });
  await diagnostics.connect();
  assert.equal(maximum, 1);
  diagnostics.disconnect();
});

test('a timed out operation disconnects and never starts the next read', async () => {
  const stalled = new Characteristic('stalled', { read: true });
  stalled.readValue = () => new Promise(() => {});
  const next = new Characteristic('next', { read: true });
  let called = false;
  next.readValue = async () => { called = true; return new DataView(new ArrayBuffer(1)); };
  const { diagnostics, device } = fixture({ timeoutMs: 8, services: [{ uuid: 'service', async getCharacteristics() { return [stalled, next]; } }] });
  await diagnostics.connect();
  assert.equal(device.gatt.connected, false);
  assert.equal(called, false);
  assert.equal(diagnostics.report.events.at(-1).details.name, 'TimeoutError');
});

test('disconnecting while a read is pending discards its late result', async () => {
  let release;
  const c = new Characteristic('slow', { read: true });
  c.readValue = () => new Promise(resolve => { release = resolve; });
  const { diagnostics } = fixture({ services: [{ uuid: 'service', async getCharacteristics() { return [c]; } }] });
  const work = diagnostics.connect();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  diagnostics.disconnect();
  release(new DataView(Uint8Array.of(99).buffer));
  await work;
  assert.equal(diagnostics.report.services[0].characteristics[0].value, undefined);
  assert.equal(diagnostics.phase, 'idle');
});

test('canceling the browser chooser is reported without inventing a connected device', async () => {
  const { diagnostics } = fixture({ chooseError: new DOMException('User cancelled', 'NotFoundError') });
  await diagnostics.connect();
  assert.equal(diagnostics.report.device, undefined);
  assert.match(diagnostics.status, /cancelada/);
});

test('UUID import reads only service UUIDs and strips generic blocked services', () => {
  const uuids = importServices(JSON.stringify({ gattServices: [{ uuid: '1800' }, { uuid: 'fff0' }, { uuid: 'fff0' }] }));
  assert.deepEqual(uuids, ['0000fff0-0000-1000-8000-00805f9b34fb']);
  assert.throws(() => requestedServices('not-a-uuid'), /UUID inválido/);
  assert.throws(() => importServices('{"events":[]}'), /lista de serviços/);
});

test('DataView byte offsets are respected when capturing protocol values', () => {
  assert.equal(readBytes(new DataView(Uint8Array.of(99, 1, 2, 88).buffer, 1, 2)).hex, '0102');
});

test('event history is bounded and restores from local storage', () => {
  const d = new BluetoothDiagnostics();
  for (let i = 0; i < 1004; i++) d.record('notification', `Event ${i}`);
  assert.equal(d.report.events.length, 1000);
  assert.equal(d.report.droppedEvents, 4);
  const restored = new BluetoothDiagnostics({ storage: { getItem() { return d.json(); } } });
  assert.equal(restored.report.events.at(-1).message, 'Event 1003');
});

test('insecure pages and unsupported browsers cannot invoke a Bluetooth request', async () => {
  const d = new BluetoothDiagnostics({ secureContext: false, bluetooth: { requestDevice() { throw new Error('Should not run'); } } });
  await assert.rejects(() => d.connect(), /HTTPS/);
  assert.equal(new BluetoothDiagnostics().supported, false);
});
