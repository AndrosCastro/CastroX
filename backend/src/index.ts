import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import app from './app';
import { config } from './config';
import { initDatabase } from './db';

function httpsCredentials(): { key: string; cert: string } {
  const certDir = process.env.CERT_DIR || path.join(__dirname, '..', 'certs');
  const keyFile = path.join(certDir, 'key.pem');
  const certFile = path.join(certDir, 'cert.pem');
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile, 'utf8'), cert: fs.readFileSync(certFile, 'utf8') };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const selfsigned = require('selfsigned');
  const pems = selfsigned.generate([{ name: 'commonName', value: 'CastroX' }], { days: 825, keySize: 2048, algorithm: 'sha256' });
  try {
    fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(keyFile, pems.private);
    fs.writeFileSync(certFile, pems.cert);
  } catch {
    /* si no se puede guardar, se regenera en cada arranque */
  }
  return { key: pems.private, cert: pems.cert };
}

async function main() {
  await initDatabase();
  http.createServer(app).listen(config.port, () => {
    console.log(`[CastroX] HTTP  -> http://localhost:${config.port}`);
  });
  if (config.enableHttps) {
    https.createServer(httpsCredentials(), app).listen(config.httpsPort, () => {
      console.log(`[CastroX] HTTPS -> https://localhost:${config.httpsPort} (para usar la cámara desde el celular)`);
    });
  }
}

main().catch((err) => {
  console.error('[CastroX] No se pudo iniciar:', err);
  process.exit(1);
});
