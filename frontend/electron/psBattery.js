// Lectura de batería de mandos PlayStation (DualShock 4 / DualSense) por HID.
// Uso: const { getPsBatteries } = require('./psBattery.js');  (proceso principal de Electron)
// Requiere: npm i node-hid  (módulo nativo: ver electron-rebuild / asarUnpack)
const HID = require('node-hid');

const SONY = 0x054c;
const MODELS = {
  0x05c4: { kind: 'ds4', name: 'DualShock 4' },
  0x09cc: { kind: 'ds4', name: 'DualShock 4' },
  0x0ce6: { kind: 'ds5', name: 'DualSense' },
  0x0df2: { kind: 'ds5', name: 'DualSense Edge' },
};

// DS4: USB -> reporte 0x01 (status en byte 30); Bluetooth -> reporte 0x11 (status en byte 32).
// Los índices incluyen el byte del Report ID (node-hid en Windows lo antepone).
function parseDs4(buf) {
  let status;
  if (buf[0] === 0x01 && buf.length >= 64) status = buf[30];
  else if (buf[0] === 0x11 && buf.length >= 40) status = buf[32];
  else return null;
  const level = status & 0x0f;
  const cable = (status & 0x10) !== 0;
  const max = cable ? 11 : 8;
  return {
    percent: Math.min(100, Math.round((Math.min(level, max) * 100) / max)),
    charging: cable && level < 11,
    wired: cable,
  };
}

// DualSense: USB -> reporte 0x01 (status en byte 53); Bluetooth -> reporte 0x31 (byte 54).
// Nibble bajo = nivel 0..10, nibble alto = estado (0 descarga, 1 cargando, 2 lleno).
function parseDs5(buf) {
  let status;
  if (buf[0] === 0x01 && buf.length >= 64) status = buf[53];
  else if (buf[0] === 0x31 && buf.length >= 70) status = buf[54];
  else return null;
  const level = status & 0x0f;
  const state = (status >> 4) & 0x0f;
  if (state === 2) return { percent: 100, charging: false, wired: false };
  return {
    percent: Math.min(100, level * 10 + 5),
    charging: state === 1,
    wired: false,
  };
}

// En Windows la ruta HID de un dispositivo Bluetooth contiene el UUID del servicio HID
// (00001124-...) o "bth"; la de USB es "hid#vid_054c&pid_xxxx#...".
const isBluetoothPath = (path) => /00001124|bth/i.test(path || '');

// DualSense por Bluetooth: para obtener la batería hay que leer el feature report 0x05, lo
// que cambia el mando al reporte extendido 0x31. Chromium (Gamepad API) no entiende ese
// formato y el mando DESAPARECE del navegador (deja de controlar el launcher y de verse en
// gamepadtester) hasta reconectarlo. Por eso está desactivado: batería "—" en ese caso.
// Ponlo en true solo si algún día no te importa perder el mando en el navegador.
const READ_DS5_OVER_BLUETOOTH = false;

function readBattery(info, model) {
  if (model.kind === 'ds5' && isBluetoothPath(info.path) && !READ_DS5_OVER_BLUETOOTH) {
    return null; // sin tocar el dispositivo: no se abre ni se cambia de modo
  }
  let dev;
  try {
    dev = new HID.HID(info.path);
  } catch {
    return null; // abierto en exclusiva por otra app (DS4Windows con HidHide, Steam Input...)
  }
  try {
    // Por Bluetooth el mando solo envía el reporte básico (sin batería) hasta que alguien
    // lee este feature report; al leerlo cambia al reporte extendido (0x11 / 0x31).
    try {
      if (model.kind === 'ds4') dev.getFeatureReport(0x02, 37);
      else dev.getFeatureReport(0x05, 41);
    } catch { /* en USB no hace falta */ }

    const parse = model.kind === 'ds4' ? parseDs4 : parseDs5;
    const deadline = Date.now() + 600;
    while (Date.now() < deadline) {
      const data = dev.readTimeout(100);
      if (!data || !data.length) continue;
      const result = parse(Buffer.from(data));
      if (result) return result;
    }
    return null;
  } finally {
    try { dev.close(); } catch { /* ignore */ }
  }
}

/** Devuelve [{ vendorId, productId, model, battery (0..1 | null), charging, wired }] */
function getPsBatteries() {
  const seen = new Set();
  const out = [];
  for (const d of HID.devices()) {
    if (d.vendorId !== SONY) continue;
    const model = MODELS[d.productId];
    if (!model) continue;
    // Solo la interfaz de gamepad (usagePage 1 / usage 5 o 4)
    if (d.usagePage !== undefined && !(d.usagePage === 1 && (d.usage === 5 || d.usage === 4))) continue;
    if (!d.path || seen.has(d.path)) continue;
    seen.add(d.path);

    const r = readBattery(d, model);
    out.push({
      vendorId: d.vendorId,
      productId: d.productId,
      model: model.name,
      battery: r ? r.percent / 100 : null,
      charging: r ? r.charging : false,
      wired: r ? r.wired : false,
    });
  }
  return out;
}

module.exports = { getPsBatteries };