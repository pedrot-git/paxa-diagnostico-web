export const DEFAULT_SERVICES = [
  '0000180f-0000-1000-8000-00805f9b34fb',
  '0000180a-0000-1000-8000-00805f9b34fb',
];
const BLOCKED_STANDARD = new Set(['00001800-0000-1000-8000-00805f9b34fb', '00001801-0000-1000-8000-00805f9b34fb']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function normalizeUuid(input) {
  let value = String(input).trim().toLowerCase();
  if (value === 'battery_service') return DEFAULT_SERVICES[0];
  if (value === 'device_information') return DEFAULT_SERVICES[1];
  value = value.replace(/^0x/, '');
  if (/^[0-9a-f]{4}$/.test(value)) value = `0000${value}-0000-1000-8000-00805f9b34fb`;
  else if (/^[0-9a-f]{8}$/.test(value)) value = `${value}-0000-1000-8000-00805f9b34fb`;
  if (!UUID.test(value)) throw new Error(`UUID inválido: ${String(input).slice(0, 80)}`);
  return value;
}

export function requestedServices(input = '') {
  const custom = input.trim() ? input.trim().split(/[\s,;]+/).map(normalizeUuid) : [];
  const result = [...new Set([...DEFAULT_SERVICES, ...custom])].filter(uuid => !BLOCKED_STANDARD.has(uuid));
  if (result.length > 32) throw new Error('Use até 32 serviços por teste.');
  return result;
}

export function importServices(text) {
  if (text.length > 1024 * 1024) throw new Error('O relatório deve ter até 1 MB.');
  const report = JSON.parse(text);
  const services = report.gattServices ?? report.services;
  if (!Array.isArray(services)) throw new Error('Este JSON não contém uma lista de serviços GATT.');
  return [...new Set(services.map(item => normalizeUuid(item.uuid)))].filter(uuid => !BLOCKED_STANDARD.has(uuid));
}

export function readBytes(value) {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const limited = bytes.slice(0, 512);
  return {
    hex: [...limited].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase(),
    bytes: bytes.length,
    truncated: bytes.length > 512,
    textHint: new TextDecoder().decode(limited).replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '').slice(0, 200),
  };
}

function initialReport(userAgent) {
  return {
    schemaVersion: 1, source: 'paxa-web', appVersion: '1.0.0', startedAt: new Date().toISOString(),
    browser: { userAgent }, services: [], events: [], droppedEvents: 0,
    limitations: [
      'Somente Bluetooth LE/GATT, nos serviços autorizados pelo navegador; não consulta SDP nem a conexão de áudio Bluetooth clássica.',
      'O ID do navegador não é o endereço MAC do fone.',
      'O site não intercepta a comunicação entre caixinha e fones.',
      'Serviços proprietários desconhecidos podem não aparecer. Nenhum serviço acessível não prova ausência de controle remoto.',
      'Não envia comandos proprietários. Ativa apenas notificações e indicações disponíveis.',
      'Os dados ficam neste navegador até você exportar ou compartilhar o relatório.',
    ],
  };
}

export class BluetoothDiagnostics {
  constructor({ bluetooth, secureContext = true, userAgent = '', onChange = () => {}, storage = null, timeoutMs = 12000 } = {}) {
    this.bluetooth = bluetooth;
    this.secureContext = secureContext;
    this.onChange = onChange;
    this.storage = storage;
    this.timeoutMs = timeoutMs;
    this.report = initialReport(userAgent);
    try {
      const old = JSON.parse(storage?.getItem('paxa-web-report') ?? 'null');
      if (old?.source === 'paxa-web' && Array.isArray(old.events) && Array.isArray(old.services)) {
        this.report = old;
        this.report.events = old.events.slice(-1000);
      }
    } catch { /* Local storage may be unavailable in private browsing. */ }
    this.status = 'Pronto para começar';
    this.phase = 'idle';
    this.generation = 0;
    this.device = null;
    this.listeners = [];
    this.disconnectListener = null;
    this.notificationCount = 0;
    this.savePending = false;
  }
  get supported() { return this.secureContext && typeof this.bluetooth?.requestDevice === 'function'; }
  get busy() { return this.phase === 'choosing' || this.phase === 'examining'; }
  record(kind, message, details) {
    this.report.events.push({ time: new Date().toISOString(), kind, message, ...(details ? { details } : {}) });
    if (this.report.events.length > 1000) {
      this.report.events.shift(); this.report.droppedEvents++;
    }
    this.report.updatedAt = new Date().toISOString();
    if (!this.savePending) {
      this.savePending = true;
      setTimeout(() => {
        this.savePending = false;
        try { this.storage?.setItem('paxa-web-report', this.json()); } catch { /* Export still works. */ }
      }, 250);
    }
    this.onChange(this);
  }
  assertCurrent(token) {
    if (token !== this.generation) {
      const error = new Error('Sessão encerrada.'); error.name = 'AbortError'; throw error;
    }
  }
  async operation(promise, label, token) {
    let timer;
    try {
      const value = await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Sem resposta ao ${label}. A conexão foi encerrada para preservar o diagnóstico.`);
          error.name = 'TimeoutError'; reject(error);
        }, this.timeoutMs);
      })]);
      this.assertCurrent(token);
      return value;
    } finally { clearTimeout(timer); }
  }
  disconnect(log = true) {
    this.generation++;
    const old = this.device;
    this.device = null;
    if (old && this.disconnectListener) old.removeEventListener('gattserverdisconnected', this.disconnectListener);
    this.disconnectListener = null;
    for (const [characteristic, listener] of this.listeners) characteristic.removeEventListener('characteristicvaluechanged', listener);
    this.listeners = [];
    try { old?.gatt?.disconnect(); } catch { /* Device may already be disconnected. */ }
    this.phase = 'idle';
    if (log) {
      this.status = 'Sessão encerrada. O relatório está disponível.';
      this.record('stopped', this.status);
    }
  }
  async connect(input = '') {
    if (!this.supported) throw new Error(this.secureContext ? 'Abra o site no Chrome do Android para usar Bluetooth.' : 'Bluetooth no navegador exige HTTPS. Use o endereço do GitHub Pages.');
    const services = requestedServices(input);
    this.disconnect(false);
    const token = this.generation;
    this.report = initialReport(globalThis.navigator?.userAgent ?? this.report.browser.userAgent);
    this.report.requestedServices = services;
    this.notificationCount = 0;
    this.phase = 'choosing'; this.status = 'Escolha seu fone ou a caixinha na lista do Chrome.';
    this.record('chooser_opened', this.status);
    try {
      // First awaited action: keep the user gesture needed by Chrome's device chooser.
      const device = await this.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: services });
      this.assertCurrent(token);
      this.device = device;
      this.report.device = { name: device.name || 'Dispositivo sem nome', browserId: device.id };
      this.disconnectListener = () => {
        if (this.device !== device) return;
        this.disconnect(false);
        this.status = 'O fone desconectou. Você pode compartilhar o relatório parcial.';
        this.record('disconnected', this.status);
      };
      device.addEventListener('gattserverdisconnected', this.disconnectListener);
      this.phase = 'examining'; this.status = 'Conectando e consultando os serviços autorizados…';
      this.record('device_selected', `${this.report.device.name} selecionado.`);
      if (!device.gatt) throw new Error('O navegador não disponibilizou uma interface GATT para esta entrada.');
      const server = await this.operation(device.gatt.connect(), 'conectar por BLE', token);
      const primary = await this.operation(server.getPrimaryServices(), 'consultar serviços', token);
      for (const service of primary) {
        this.assertCurrent(token);
        const item = { uuid: service.uuid, characteristics: [] };
        this.report.services.push(item);
        let characteristics;
        try { characteristics = await this.operation(service.getCharacteristics(), 'listar características', token); }
        catch (error) {
          if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
          this.record('service_error', `Serviço ${service.uuid} não pôde ser examinado.`, { error: error.message });
          continue;
        }
        for (const characteristic of characteristics) {
          this.assertCurrent(token);
          const properties = Object.fromEntries(['read', 'write', 'writeWithoutResponse', 'notify', 'indicate', 'broadcast', 'authenticatedSignedWrites', 'reliableWrite', 'writableAuxiliaries'].map(key => [key, Boolean(characteristic.properties[key])]));
          const info = { uuid: characteristic.uuid, properties };
          item.characteristics.push(info);
          if (properties.read) {
            try {
              const value = await this.operation(characteristic.readValue(), 'ler uma característica', token);
              info.value = readBytes(value);
              this.record('read', `Leitura recebida de ${characteristic.uuid}.`, { service: service.uuid, characteristic: characteristic.uuid, ...info.value });
            } catch (error) {
              if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
              info.readError = { name: error.name, message: error.message };
              this.record('read_error', `Leitura indisponível em ${characteristic.uuid}.`, info.readError);
            }
          }
          if (properties.notify || properties.indicate) {
            const listener = event => {
              if (token !== this.generation) return;
              this.notificationCount++;
              this.record('notification', `Evento recebido de ${characteristic.uuid}.`, { service: service.uuid, characteristic: characteristic.uuid, ...readBytes(event.target.value) });
            };
            characteristic.addEventListener('characteristicvaluechanged', listener);
            this.listeners.push([characteristic, listener]);
            try {
              await this.operation(characteristic.startNotifications(), 'ativar notificações', token);
              info.notifications = true;
              this.record('subscription', `Notificações ativadas em ${characteristic.uuid}.`);
            } catch (error) {
              characteristic.removeEventListener('characteristicvaluechanged', listener);
              if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
              info.notificationError = { name: error.name, message: error.message };
              this.record('subscription_error', `Não foi possível receber notificações de ${characteristic.uuid}.`, info.notificationError);
            }
          }
        }
      }
      this.assertCurrent(token);
      this.phase = 'observing';
      this.status = primary.length ? `${primary.length} serviço(s) acessível(is). Agora você pode testar a caixinha.` : 'Nenhum serviço acessível com as permissões atuais. Isso não prova que o fone não tem outros serviços.';
      this.record('diagnostic_finished', this.status);
    } catch (error) {
      if (token !== this.generation) return;
      this.disconnect(false);
      this.phase = 'idle';
      this.status = error.name === 'NotFoundError' && !this.report.device ? 'Seleção cancelada ou nenhum dispositivo foi escolhido.' : error.name === 'NotFoundError' ? 'Nenhum serviço autorizado foi encontrado. Veja os UUIDs adicionais ou compartilhe o relatório parcial.' : `Não foi possível concluir: ${error.message}`;
      this.record('diagnostic_error', this.status, { name: error.name, message: error.message });
    }
  }
  marker(message) {
    if (!this.report.device) throw new Error('Selecione um dispositivo antes de marcar um teste.');
    const value = String(message).trim().slice(0, 300);
    if (!value) return;
    this.record('user_marker', value, { connected: Boolean(this.device?.gatt?.connected), notificationsSoFar: this.notificationCount });
  }
  json() { return JSON.stringify(this.report, null, 2); }
  text() {
    return [
      'PAXA DIAGNÓSTICO WEB · 1.0.0',
      `Início: ${this.report.startedAt}`,
      `Navegador: ${this.report.browser.userAgent}`,
      `Dispositivo: ${JSON.stringify(this.report.device ?? null)}`,
      `Serviços solicitados: ${JSON.stringify(this.report.requestedServices ?? [])}`,
      `Serviços acessíveis: ${JSON.stringify(this.report.services, null, 2)}`,
      '\nEVENTOS',
      ...this.report.events.map(event => `${event.time} [${event.kind}] ${event.message}${event.details ? '\n' + JSON.stringify(event.details) : ''}`),
      `\nEventos antigos descartados: ${this.report.droppedEvents}`,
      '\nLIMITAÇÕES', ...this.report.limitations.map(line => `• ${line}`),
    ].join('\n');
  }
}
