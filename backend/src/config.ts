function databaseUrl(): string {
  // Vercel + Neon definen DATABASE_URL (o POSTGRES_URL); en Docker se arma con las variables DB_*
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) return url;
  const user = encodeURIComponent(process.env.DB_USER || 'castrox');
  const pass = encodeURIComponent(process.env.DB_PASSWORD || '');
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const name = process.env.DB_NAME || 'castrox';
  return `postgres://${user}:${pass}@${host}:${port}/${name}`;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  httpsPort: Number(process.env.HTTPS_PORT || 3443),
  enableHttps: process.env.ENABLE_HTTPS !== 'false',
  serverless: !!process.env.VERCEL,
  jwtSecret: process.env.JWT_SECRET || 'castrox-dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  seedDemo: process.env.SEED_DEMO !== 'false',
  db: {
    url: databaseUrl(),
    // Las bases en la nube (Neon) exigen SSL; el Postgres de Docker no lo usa
    ssl: !!(process.env.DATABASE_URL || process.env.POSTGRES_URL) && !/sslmode=disable/.test(databaseUrl()),
  },
};

if (config.serverless && (!process.env.JWT_SECRET || config.jwtSecret.length < 32)) {
  throw new Error('En producción define JWT_SECRET (al menos 32 caracteres)');
}
