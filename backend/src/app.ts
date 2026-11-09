import express from 'express';
import path from 'path';
import QRCode from 'qrcode';
import { config } from './config';
import { initDatabase } from './db';
import { errorHandler } from './errors';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import productRoutes from './routes/products';
import movementRoutes from './routes/movements';
import dashboardRoutes from './routes/dashboard';
import userRoutes from './routes/users';

const app = express();
const publicDir = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
// Detrás de Vercel / Cloudflare Tunnel / Caddy: confiar en el proxy para obtener la IP real
app.set('trust proxy', config.serverless ? 1 : 'loopback, linklocal, uniquelocal');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  // Permite que la app Android verifique el servidor desde su pantalla de conexión
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ status: 'ok', app: 'CastroX', time: new Date().toISOString() });
});

// Generador de imágenes QR (solo codifica el texto recibido, no expone datos)
app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text ?? '').slice(0, 500);
  const size = Math.min(1000, Math.max(80, Number(req.query.size) || 300));
  if (!text) {
    res.status(400).json({ error: 'Falta el texto' });
    return;
  }
  const png = await QRCode.toBuffer(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(png);
});

// El resto de la API necesita la base de datos: se prepara (tablas y datos iniciales) en la primera petición
app.use('/api', async (_req, _res, next) => {
  await initDatabase();
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/movements', movementRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// En Docker el mismo servidor entrega el frontend; en Vercel lo sirve su CDN
if (!config.serverless) {
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}
app.use(errorHandler);

export default app;
