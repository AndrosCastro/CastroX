import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from './config';

// Postgres devuelve NUMERIC y BIGINT (COUNT, SUM) como texto: convertirlos a número para la API
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export type Params = Record<string, unknown>;
export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<pg.QueryResult>;
}

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl,
      // En Vercel cada instancia atiende pocas peticiones a la vez: pocas conexiones por instancia
      max: config.serverless ? 3 : 10,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[DB] Error en conexión inactiva:', err.message));
  }
  return pool;
}

/**
 * Convierte parámetros con nombre (@nombre) a los posicionales de Postgres ($1, $2...).
 * Así las consultas se leen igual que antes y siguen siendo parametrizadas.
 */
function compile(text: string, params: Params = {}): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const index = new Map<string, number>();
  const out = text.replace(/@(\w+)/g, (match, name: string) => {
    if (!(name in params)) return match;
    if (!index.has(name)) {
      const v = params[name];
      values.push(v === undefined ? null : v);
      index.set(name, values.length);
    }
    return `$${index.get(name)}`;
  });
  return { text: out, values };
}

/** Ejecuta una consulta y devuelve las filas. `db` puede ser el pool o un cliente dentro de una transacción. */
export async function query<T = any>(text: string, params?: Params, db: Queryable = getPool()): Promise<{ rows: T[]; rowCount: number }> {
  const c = compile(text, params);
  const r = await db.query(c.text, c.values);
  return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
}

/** Ejecuta `fn` dentro de una transacción (BEGIN / COMMIT / ROLLBACK). */
export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS Users (
    Id SERIAL PRIMARY KEY,
    Username VARCHAR(50) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
    FullName VARCHAR(100) NOT NULL,
    PasswordHash VARCHAR(200) NOT NULL,
    Role VARCHAR(20) NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN ('admin','operador')),
    Active BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS Categories (
    Id SERIAL PRIMARY KEY,
    Name VARCHAR(80) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
    Description VARCHAR(255) NULL,
    Color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS Products (
    Id SERIAL PRIMARY KEY,
    Code VARCHAR(100) NOT NULL CONSTRAINT UQ_Products_Code UNIQUE,
    Name VARCHAR(150) NOT NULL,
    Description VARCHAR(500) NULL,
    CategoryId INT NULL REFERENCES Categories(Id) ON DELETE SET NULL,
    Unit VARCHAR(20) NOT NULL DEFAULT 'pza',
    Cost NUMERIC(18,2) NOT NULL DEFAULT 0,
    Price NUMERIC(18,2) NOT NULL DEFAULT 0,
    Quantity NUMERIC(18,2) NOT NULL DEFAULT 0,
    MinStock NUMERIC(18,2) NOT NULL DEFAULT 0,
    Location VARCHAR(100) NULL,
    Supplier VARCHAR(100) NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS Movements (
    Id SERIAL PRIMARY KEY,
    ProductId INT NOT NULL REFERENCES Products(Id) ON DELETE CASCADE,
    Type VARCHAR(10) NOT NULL CONSTRAINT CK_Movements_Type CHECK (Type IN ('IN','OUT','ADJUST')),
    Quantity NUMERIC(18,2) NOT NULL,
    PreviousQty NUMERIC(18,2) NOT NULL,
    NewQty NUMERIC(18,2) NOT NULL,
    Reason VARCHAR(255) NULL,
    UserId INT NULL REFERENCES Users(Id) ON DELETE SET NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS IX_Movements_Product ON Movements(ProductId, CreatedAt DESC);
  CREATE INDEX IF NOT EXISTS IX_Movements_CreatedAt ON Movements(CreatedAt DESC);
  CREATE INDEX IF NOT EXISTS IX_Products_Name ON Products(Name);`;

async function seed(tx: Queryable) {
  const users = await query('SELECT COUNT(*) AS n FROM Users', {}, tx);
  if (users.rows[0].n === 0) {
    const hash = await bcrypt.hash(config.adminPassword, 10);
    await query(`INSERT INTO Users (Username, FullName, PasswordHash, Role) VALUES (@u, 'Administrador', @h, 'admin')`, { u: config.adminUser, h: hash }, tx);
    console.log(`[DB] Usuario administrador creado: ${config.adminUser}`);
  }

  const cats = await query('SELECT COUNT(*) AS n FROM Categories', {}, tx);
  if (cats.rows[0].n === 0) {
    await query(
      `INSERT INTO Categories (Name, Description, Color) VALUES
        ('General', 'Productos sin clasificación específica', '#6366f1'),
        ('Electrónica', 'Dispositivos, cables y accesorios', '#0ea5e9'),
        ('Herramientas', 'Herramientas manuales y eléctricas', '#f59e0b'),
        ('Oficina', 'Papelería y artículos de oficina', '#10b981'),
        ('Limpieza', 'Productos de limpieza e higiene', '#ec4899')`,
      {},
      tx,
    );
    console.log('[DB] Categorías iniciales creadas');
  }

  const prods = await query('SELECT COUNT(*) AS n FROM Products', {}, tx);
  if (prods.rows[0].n === 0 && config.seedDemo) {
    await query(
      `INSERT INTO Products (Code, Name, Description, CategoryId, Unit, Cost, Price, Quantity, MinStock, Location, Supplier)
      SELECT v.Code, v.Name, v.Description, c.Id, v.Unit, v.Cost, v.Price, v.Qty, v.MinStock, v.Location, v.Supplier
      FROM (VALUES
        ('CX-0001', 'Cable USB-C 1m', 'Cable de carga y datos USB-C a USB-C', 'Electrónica', 'pza', 45.00, 99.00, 40, 10, 'Estante A1', 'TecnoMayoreo'),
        ('CX-0002', 'Mouse inalámbrico', 'Mouse óptico 2.4GHz con receptor USB', 'Electrónica', 'pza', 120.00, 249.00, 6, 8, 'Estante A2', 'TecnoMayoreo'),
        ('CX-0003', 'Desarmador de precisión', 'Juego de 24 puntas magnéticas', 'Herramientas', 'pza', 85.00, 179.00, 15, 5, 'Estante B1', 'Ferretería Central'),
        ('CX-0004', 'Hojas blancas carta', 'Paquete de 500 hojas 75g', 'Oficina', 'paquete', 70.00, 115.00, 25, 10, 'Bodega 1', 'Papelería del Centro'),
        ('CX-0005', 'Limpiador multiusos 1L', 'Limpiador aroma lavanda', 'Limpieza', 'lt', 22.00, 39.00, 0, 6, 'Bodega 2', 'Distribuidora Limpia')
      ) AS v(Code, Name, Description, Category, Unit, Cost, Price, Qty, MinStock, Location, Supplier)
      LEFT JOIN Categories c ON c.Name = v.Category`,
      {},
      tx,
    );
    await query(
      `INSERT INTO Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId)
      SELECT Id, 'IN', Quantity, 0, Quantity, 'Inventario inicial', (SELECT Id FROM Users ORDER BY Id LIMIT 1)
      FROM Products WHERE Quantity > 0`,
      {},
      tx,
    );
    console.log('[DB] Productos de demostración creados');
  }
}

async function init(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await getPool().query('SELECT 1');
      break;
    } catch (err: any) {
      if (attempt >= (config.serverless ? 3 : 40)) throw err;
      console.log(`[DB] Esperando a Postgres (intento ${attempt}): ${err.message}`);
      await new Promise((r) => setTimeout(r, config.serverless ? 500 : 3000));
    }
  }
  // Un candado evita que dos instancias que arrancan a la vez creen tablas o datos duplicados
  await transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(724831)');
    await tx.query(SCHEMA);
    await seed(tx);
  });
  console.log('[DB] Conectado a Postgres, base de datos lista');
}

/** Prepara la base de datos una sola vez por proceso (o instancia serverless). */
export function initDatabase(): Promise<void> {
  if (!ready) {
    ready = init().catch((err) => {
      ready = null; // reintentar en la siguiente petición
      throw err;
    });
  }
  return ready;
}
