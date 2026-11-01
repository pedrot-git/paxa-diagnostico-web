import { BluetoothDiagnostics, importServices, requestedServices, filterSessionEvents } from './core.mjs?v=1.1.0';

const $ = id => document.getElementById(id);
let renderPending = false;
let toastTimer;
let logFilter = 'all';
let storage;
try { storage = localStorage; } catch { storage = null; }
const diagnostics = new BluetoothDiagnostics({
  bluetooth: navigator.bluetooth, secureContext: window.isSecureContext,
  userAgent: navigator.userAgent, storage,
  onChange() {
    if (!renderPending) { renderPending = true; requestAnimationFrame(() => { renderPending = false; render(); }); }
  },
});

function notify(message) {
  $('toast-message').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}

function render() {
  const capable = diagnostics.supported;
  $('compatibility').classList.toggle('unavailable', !capable);
  $('compat-title').textContent = capable ? 'Chrome compatível com Web Bluetooth' : !window.isSecureContext ? 'Use o endereço HTTPS para conectar' : 'Bluetooth não disponível neste navegador';
  $('compat-description').textContent = capable ? 'Você autoriza o acesso ao selecionar seu fone.' : !window.isSecureContext ? 'A prévia HTTP não permite testar Bluetooth pelo celular.' : 'No A56, abra este site diretamente no Chrome.';
  $('connect').disabled = !capable || diagnostics.busy;
  $('connect-label').textContent = diagnostics.busy ? 'Examinando a conexão…' : 'Conectar meu fone';
  $('connect').setAttribute('aria-busy', String(diagnostics.busy));
  $('disconnect').disabled = !diagnostics.device && !diagnostics.busy;
  $('phase').textContent = ({ idle: 'EM ESPERA', choosing: 'SELECIONE', examining: 'EXAMINANDO', observing: 'CONECTADO' })[diagnostics.phase];
  $('phase').classList.toggle('active', diagnostics.phase !== 'idle');
  $('session-status').textContent = diagnostics.status;
  $('device-name').textContent = diagnostics.report.device?.name ?? 'Esperando seu fone';
  $('device-caption').textContent = diagnostics.report.device ? diagnostics.device?.gatt?.connected ? 'Conexão BLE ativa neste navegador' : 'Dados do último dispositivo selecionado' : 'Conecte para começar a examinar.';
  $('sessao').classList.toggle('connected', Boolean(diagnostics.device?.gatt?.connected));
  const services = diagnostics.report.services;
  $('services-count').textContent = diagnostics.report.device ? services.length : '—';
  $('characteristics-count').textContent = diagnostics.report.device ? services.reduce((sum, item) => sum + (item.characteristics?.length ?? 0), 0) : '—';
  $('notifications-count').textContent = diagnostics.report.device ? diagnostics.notificationCount : '—';
  document.querySelectorAll('[data-marker]').forEach(button => { button.disabled = !diagnostics.report.device; });
  const serviceNodes = services.map(service => {
    const row = document.createElement('div'); row.className = 'service-row';
    const title = document.createElement('strong'); title.textContent = service.uuid;
    const caption = document.createElement('small'); caption.textContent = `${service.characteristics.length} característica(s) · ${service.characteristics.filter(c => c.notifications).length} com notificações`;
    row.append(title, caption); return row;
  });
  if (!serviceNodes.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Os serviços autorizados aparecerão após o diagnóstico.'; serviceNodes.push(empty);
  }
  $('service-list').replaceChildren(...serviceNodes);
  const events = diagnostics.report.events;
  $('event-count').textContent = `${events.length} evento(s)`;
  $('report-caption').textContent = events.length ? `${events.length} eventos registrados · exportação local` : 'Nenhum teste iniciado';
  document.querySelectorAll('[data-log-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.logFilter === logFilter)));
  const eventNodes = filterSessionEvents(events, logFilter).slice(-35).reverse().map(event => {
    const li = document.createElement('li'); li.className = 'log-event';
    if (event.kind === 'user_marker') li.classList.add('marker-event');
    if (/error|timeout|unavailable|disconnected/.test(event.kind)) li.classList.add('error-event');
    const time = document.createElement('time'); time.dateTime = event.time;
    time.textContent = new Date(event.time).toLocaleTimeString('pt-BR');
    const value = document.createElement('span'); value.textContent = event.message;
    li.append(time, value); return li;
  });
  if (!eventNodes.length) {
    const li = document.createElement('li'); li.className = 'empty-log';
    li.textContent = logFilter === 'markers' ? 'Seus testes marcados na caixinha aparecerão aqui.' : logFilter === 'errors' ? 'Nenhum aviso registrado nesta sessão.' : 'O registro começa quando você conecta seu fone.';
    eventNodes.push(li);
  }
  $('event-list').replaceChildren(...eventNodes);
}

$('connect').addEventListener('click', async () => {
  try { requestedServices($('uuids').value); }
  catch (error) {
    $('advanced').open = true;
    $('uuid-error').textContent = error.message;
    $('uuid-error').hidden = false;
    $('uuids').setAttribute('aria-invalid', 'true');
    $('connection-error-text').textContent = error.message;
    $('connection-error').hidden = false;
    $('connection-error').focus();
    return;
  }
  $('connection-error').hidden = true;
  try { await diagnostics.connect($('uuids').value); }
  catch (error) { notify(error.message); }
  render();
});
$('disconnect').addEventListener('click', () => diagnostics.disconnect());
$('uuids').addEventListener('input', () => {
  $('uuid-error').hidden = true; $('connection-error').hidden = true; $('uuids').removeAttribute('aria-invalid');
});
document.querySelectorAll('[data-log-filter]').forEach(button => button.addEventListener('click', () => { logFilter = button.dataset.logFilter; render(); }));
document.querySelectorAll('[data-marker]').forEach(button => button.addEventListener('click', () => {
  try {
    diagnostics.marker(button.dataset.marker); notify('Mudança registrada no relatório.');
    button.classList.add('recorded');
    setTimeout(() => button.classList.remove('recorded'), 1400);
  }
  catch (error) { notify(error.message); }
}));
$('custom-marker').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!$('marker-text').value.trim()) throw new Error('Descreva o teste que você fez na caixinha.');
    diagnostics.marker($('marker-text').value); $('marker-text').value = ''; $('marker-error').hidden = true; notify('Teste registrado no relatório.');
  }
  catch (error) { $('marker-error').textContent = error.message; $('marker-error').hidden = false; $('marker-text').focus(); }
});
$('import-report').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('O relatório deve ter até 1 MB.');
    const imported = importServices(await file.text());
    const current = $('uuids').value.trim();
    $('uuids').value = [...new Set([...(current ? current.split(/[\s,;]+/) : []), ...imported])].join('\n');
    requestedServices($('uuids').value);
    $('import-status').textContent = `${imported.length} serviço(s) importado(s). Selecione o fone novamente para autorizar o acesso.`;
    notify('UUIDs importados. O conteúdo do relatório não foi enviado.');
  } catch (error) { $('import-status').textContent = error.message; notify(error.message); }
  event.target.value = '';
});

function files() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return [new File([diagnostics.json()], `paxa-web-${stamp}.json`, { type: 'application/json' }), new File([diagnostics.text()], `paxa-web-${stamp}.txt`, { type: 'text/plain' })];
}
function download(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('download-json').addEventListener('click', () => { download(files()[0]); notify('Relatório JSON pronto para anexar na conversa.'); });
$('download-text').addEventListener('click', () => download(files()[1]));
$('share').addEventListener('click', async () => {
  const reportFiles = files();
  try {
    if (navigator.canShare?.({ files: reportFiles })) await navigator.share({ title: 'PAXA Diagnóstico Web', files: reportFiles });
    else { download(reportFiles[0]); notify('Relatório baixado. Anexe o arquivo na conversa.'); }
  } catch (error) { if (error.name !== 'AbortError') notify('Use Baixar relatório JSON para compartilhar o resultado.'); }
});

window.addEventListener('pagehide', () => {
  try { storage?.setItem('paxa-web-report', diagnostics.json()); } catch { }
  diagnostics.disconnect(false);
});
render();
