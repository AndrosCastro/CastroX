export const config = {
  port: Number(process.env.PORT || 3000),
  httpsPort: Number(process.env.HTTPS_PORT || 3443),
  enableHttps: process.env.ENABLE_HTTPS !== 'false',
  jwtSecret: process.env.JWT_SECRET || 'castrox-dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  seedDemo: process.env.SEED_DEMO !== 'false',
  db: {
    server: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'CastroX',
  },
};

if (!/^\w+$/.test(config.db.database)) {
  throw new Error('DB_NAME solo puede contener letras, números y guion bajo');
}
