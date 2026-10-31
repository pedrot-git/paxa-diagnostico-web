import { BluetoothDiagnostics, importServices, requestedServices } from './core.mjs';

const $ = id => document.getElementById(id);
let renderPending = false;
let toastTimer;
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
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}

function render() {
  const capable = diagnostics.supported;
  $('compatibility').classList.toggle('unavailable', !capable);
  $('compat-title').textContent = capable ? 'Navegador compatível com Web Bluetooth' : !window.isSecureContext ? 'Abra a versão HTTPS para testar o Bluetooth' : 'Este navegador não disponibilizou Web Bluetooth';
  $('compat-description').textContent = capable ? 'O acesso depende de você escolher um dispositivo e autorizar os serviços BLE.' : !window.isSecureContext ? 'O endereço HTTP da rede local permite ver a página, mas o teste no celular exige HTTPS.' : 'No A56, abra este endereço diretamente no Chrome. Você ainda pode exportar um relatório anterior.';
  $('connect').disabled = !capable || diagnostics.busy;
  $('connect').lastChild.textContent = diagnostics.busy ? ' Diagnóstico em andamento…' : ' Selecionar fone e diagnosticar';
  $('disconnect').disabled = !diagnostics.device && !diagnostics.busy;
  $('phase').textContent = ({ idle: 'EM ESPERA', choosing: 'SELECIONE', examining: 'EXAMINANDO', observing: 'CONECTADO' })[diagnostics.phase];
  $('phase').classList.toggle('active', diagnostics.phase !== 'idle');
  $('session-status').textContent = diagnostics.status;
  $('device-name').textContent = diagnostics.report.device?.name ?? 'Nenhum dispositivo selecionado';
  $('device-caption').textContent = diagnostics.report.device ? diagnostics.device?.gatt?.connected ? 'Conexão BLE ativa neste navegador' : 'Dados do último dispositivo selecionado' : 'O dispositivo escolhido aparecerá aqui.';
  const services = diagnostics.report.services;
  $('services-count').textContent = services.length;
  $('characteristics-count').textContent = services.reduce((sum, item) => sum + (item.characteristics?.length ?? 0), 0);
  $('notifications-count').textContent = diagnostics.notificationCount;
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
  const eventNodes = events.slice(-35).reverse().map(event => {
    const li = document.createElement('li'); li.className = 'log-event';
    const time = document.createElement('time'); time.dateTime = event.time;
    time.textContent = new Date(event.time).toLocaleTimeString('pt-BR');
    const value = document.createElement('span'); value.textContent = event.message;
    li.append(time, value); return li;
  });
  if (!eventNodes.length) {
    const li = document.createElement('li'); li.className = 'empty-state'; li.textContent = 'Os eventos do diagnóstico aparecerão aqui.'; eventNodes.push(li);
  }
  $('event-list').replaceChildren(...eventNodes);
}

$('connect').addEventListener('click', async () => {
  try { await diagnostics.connect($('uuids').value); }
  catch (error) { notify(error.message); }
  render();
});
$('disconnect').addEventListener('click', () => diagnostics.disconnect());
document.querySelectorAll('[data-marker]').forEach(button => button.addEventListener('click', () => {
  try { diagnostics.marker(button.dataset.marker); notify('Mudança registrada no relatório.'); }
  catch (error) { notify(error.message); }
}));
$('custom-marker').addEventListener('submit', event => {
  event.preventDefault();
  try { diagnostics.marker($('marker-text').value); $('marker-text').value = ''; notify('Teste registrado no relatório.'); }
  catch (error) { notify(error.message); }
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
