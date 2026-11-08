// Envoltura del lector html5-qrcode (QR y códigos de barras)
import { openModal, icon, esc, beep } from './ui.js';

export function cameraSupportError() {
  if (!window.isSecureContext) {
    const httpsUrl = `https://${location.hostname}:3443${location.pathname}${location.hash}`;
    return `La cámara solo funciona en conexiones seguras. Abre la app en <a href="${esc(httpsUrl)}">${esc(httpsUrl)}</a> (acepta el aviso del certificado) o en http://localhost.`;
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'Este navegador no permite usar la cámara.';
  if (!window.Html5Qrcode) return 'No se pudo cargar el lector de QR. Revisa tu conexión a internet y recarga la página.';
  return null;
}

export class Scanner {
  constructor(elementId, onScan, { cooldown = 1800 } = {}) {
    this.elementId = elementId;
    this.onScan = onScan;
    this.cooldown = cooldown;
    this.qr = null;
    this.running = false;
    this.paused = false;
    this.last = '';
    this.lastAt = 0;
  }

  static async cameras() {
    try { return await window.Html5Qrcode.getCameras(); } catch { return []; }
  }

  async start(cameraId) {
    const err = cameraSupportError();
    if (err) throw new Error(err.replace(/<[^>]+>/g, ''));
    await this.stop();
    this.qr = new window.Html5Qrcode(this.elementId, { verbose: false });
    const config = { fps: 12, aspectRatio: 4 / 3, disableFlip: false };
    const source = cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'environment' };
    try {
      await this.qr.start(source, config, (text) => this.#handle(text), () => {});
    } catch (e) {
      const msg = String(e?.message || e);
      if (/NotAllowed|Permission/i.test(msg)) throw new Error('Permiso de cámara denegado. Habilítalo en la configuración del navegador.');
      if (/NotFound|Requested device not found/i.test(msg)) throw new Error('No se encontró ninguna cámara.');
      if (/NotReadable|in use/i.test(msg)) throw new Error('La cámara está siendo usada por otra aplicación.');
      throw new Error(`No se pudo iniciar la cámara: ${msg}`);
    }
    this.running = true;
  }

  #handle(raw) {
    const text = String(raw || '').trim();
    if (!text || this.paused) return;
    const now = Date.now();
    if (text === this.last && now - this.lastAt < this.cooldown) return;
    this.last = text;
    this.lastAt = now;
    this.onScan(text);
  }

  async stop() {
    if (this.qr) {
      try { if (this.running) await this.qr.stop(); } catch { /* ya detenido */ }
      try { this.qr.clear(); } catch { /* ignorar */ }
    }
    this.qr = null;
    this.running = false;
  }
}

/** Abre un modal con la cámara y devuelve el primer código leído (o null si se cancela). */
export function scanOnce(title = 'Escanear código') {
  return new Promise((resolve) => {
    let done = false;
    const scanner = new Scanner('scan-once-reader', (code) => {
      if (done) return;
      done = true;
      beep(true);
      resolve(code);
      modal.close();
    });
    const supportErr = cameraSupportError();
    const modal = openModal({
      title,
      body: `
        ${supportErr ? `<div class="notice warning">${icon('alert', 18)}<div>${supportErr}</div></div>` : `
        <div class="reader-box"><div id="scan-once-reader"></div><div class="reader-frame"></div></div>
        <p class="muted small" style="margin:12px 0 0;text-align:center">Apunta la cámara al código QR o de barras</p>`}
        <form id="scan-once-manual" class="input-group" style="margin-top:14px">
          <input class="input" name="code" placeholder="O escribe el código manualmente" autocomplete="off" ${supportErr ? 'autofocus' : ''} />
          <button class="btn primary" type="submit">Usar</button>
        </form>`,
      onClose: () => { scanner.stop(); if (!done) { done = true; resolve(null); } },
    });
    modal.el.querySelector('#scan-once-manual').addEventListener('submit', (e) => {
      e.preventDefault();
      const code = new FormData(e.target).get('code')?.toString().trim();
      if (!code) return;
      done = true;
      resolve(code);
      modal.close();
    });
    if (!supportErr) {
      scanner.start().catch((e) => {
        const box = modal.el.querySelector('.reader-box');
        if (box) box.outerHTML = `<div class="notice warning">${icon('alert', 18)}<div>${esc(e.message)}</div></div>`;
      });
    }
  });
}
