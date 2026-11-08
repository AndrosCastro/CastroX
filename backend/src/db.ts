import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { config } from './config';

let pool: sql.ConnectionPool | null = null;

function connectionConfig(database: string): sql.config {
  return {
    server: config.db.server,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database,
    options: { encrypt: false, trustServerCertificate: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}

export function getPool(): sql.ConnectionPool {
  if (!pool) throw new Error('La base de datos no está inicializada');
  return pool;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SCHEMA: string[] = [
  `IF OBJECT_ID('dbo.Users','U') IS NULL
   CREATE TABLE dbo.Users (
     Id INT IDENTITY(1,1) PRIMARY KEY,
     Username NVARCHAR(50) NOT NULL CONSTRAINT UQ_Users_Username UNIQUE,
     FullName NVARCHAR(100) NOT NULL,
     PasswordHash NVARCHAR(200) NOT NULL,
     Role NVARCHAR(20) NOT NULL CONSTRAINT CK_Users_Role CHECK (Role IN ('admin','operador')),
     Active BIT NOT NULL CONSTRAINT DF_Users_Active DEFAULT 1,
     CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
   )`,
  `IF OBJECT_ID('dbo.Categories','U') IS NULL
   CREATE TABLE dbo.Categories (
     Id INT IDENTITY(1,1) PRIMARY KEY,
     Name NVARCHAR(80) NOT NULL CONSTRAINT UQ_Categories_Name UNIQUE,
     Description NVARCHAR(255) NULL,
     Color NVARCHAR(7) NOT NULL CONSTRAINT DF_Categories_Color DEFAULT '#6366f1',
     CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Categories_CreatedAt DEFAULT SYSUTCDATETIME()
   )`,
  `IF OBJECT_ID('dbo.Products','U') IS NULL
   CREATE TABLE dbo.Products (
     Id INT IDENTITY(1,1) PRIMARY KEY,
     Code NVARCHAR(100) NOT NULL CONSTRAINT UQ_Products_Code UNIQUE,
     Name NVARCHAR(150) NOT NULL,
     Description NVARCHAR(500) NULL,
     CategoryId INT NULL CONSTRAINT FK_Products_Categories REFERENCES dbo.Categories(Id) ON DELETE SET NULL,
     Unit NVARCHAR(20) NOT NULL CONSTRAINT DF_Products_Unit DEFAULT 'pza',
     Cost DECIMAL(18,2) NOT NULL CONSTRAINT DF_Products_Cost DEFAULT 0,
     Price DECIMAL(18,2) NOT NULL CONSTRAINT DF_Products_Price DEFAULT 0,
     Quantity DECIMAL(18,2) NOT NULL CONSTRAINT DF_Products_Quantity DEFAULT 0,
     MinStock DECIMAL(18,2) NOT NULL CONSTRAINT DF_Products_MinStock DEFAULT 0,
     Location NVARCHAR(100) NULL,
     Supplier NVARCHAR(100) NULL,
     CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Products_CreatedAt DEFAULT SYSUTCDATETIME(),
     UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_Products_UpdatedAt DEFAULT SYSUTCDATETIME()
   )`,
  `IF OBJECT_ID('dbo.Movements','U') IS NULL
   CREATE TABLE dbo.Movements (
     Id INT IDENTITY(1,1) PRIMARY KEY,
     ProductId INT NOT NULL CONSTRAINT FK_Movements_Products REFERENCES dbo.Products(Id) ON DELETE CASCADE,
     Type NVARCHAR(10) NOT NULL CONSTRAINT CK_Movements_Type CHECK (Type IN ('IN','OUT','ADJUST')),
     Quantity DECIMAL(18,2) NOT NULL,
     PreviousQty DECIMAL(18,2) NOT NULL,
     NewQty DECIMAL(18,2) NOT NULL,
     Reason NVARCHAR(255) NULL,
     UserId INT NULL CONSTRAINT FK_Movements_Users REFERENCES dbo.Users(Id) ON DELETE SET NULL,
     CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Movements_CreatedAt DEFAULT SYSUTCDATETIME()
   )`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Movements_Product')
   CREATE INDEX IX_Movements_Product ON dbo.Movements(ProductId, CreatedAt DESC)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Movements_CreatedAt')
   CREATE INDEX IX_Movements_CreatedAt ON dbo.Movements(CreatedAt DESC)`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Products_Name')
   CREATE INDEX IX_Products_Name ON dbo.Products(Name)`,
];

async function seed(p: sql.ConnectionPool) {
  const users = await p.request().query('SELECT COUNT(*) AS n FROM dbo.Users');
  if (users.recordset[0].n === 0) {
    const hash = await bcrypt.hash(config.adminPassword, 10);
    await p
      .request()
      .input('u', sql.NVarChar(50), config.adminUser)
      .input('h', sql.NVarChar(200), hash)
      .query(`INSERT INTO dbo.Users (Username, FullName, PasswordHash, Role) VALUES (@u, N'Administrador', @h, 'admin')`);
    console.log(`[DB] Usuario administrador creado: ${config.adminUser}`);
  }

  const cats = await p.request().query('SELECT COUNT(*) AS n FROM dbo.Categories');
  if (cats.recordset[0].n === 0) {
    await p.request().query(`
      INSERT INTO dbo.Categories (Name, Description, Color) VALUES
        (N'General', N'Productos sin clasificación específica', '#6366f1'),
        (N'Electrónica', N'Dispositivos, cables y accesorios', '#0ea5e9'),
        (N'Herramientas', N'Herramientas manuales y eléctricas', '#f59e0b'),
        (N'Oficina', N'Papelería y artículos de oficina', '#10b981'),
        (N'Limpieza', N'Productos de limpieza e higiene', '#ec4899')`);
    console.log('[DB] Categorías iniciales creadas');
  }

  const prods = await p.request().query('SELECT COUNT(*) AS n FROM dbo.Products');
  if (prods.recordset[0].n === 0 && config.seedDemo) {
    await p.request().query(`
      DECLARE @admin INT = (SELECT TOP 1 Id FROM dbo.Users ORDER BY Id);
      INSERT INTO dbo.Products (Code, Name, Description, CategoryId, Unit, Cost, Price, Quantity, MinStock, Location, Supplier)
      SELECT v.Code, v.Name, v.Description, c.Id, v.Unit, v.Cost, v.Price, v.Qty, v.MinStock, v.Location, v.Supplier
      FROM (VALUES
        (N'CX-0001', N'Cable USB-C 1m', N'Cable de carga y datos USB-C a USB-C', N'Electrónica', N'pza', 45.00, 99.00, 40, 10, N'Estante A1', N'TecnoMayoreo'),
        (N'CX-0002', N'Mouse inalámbrico', N'Mouse óptico 2.4GHz con receptor USB', N'Electrónica', N'pza', 120.00, 249.00, 6, 8, N'Estante A2', N'TecnoMayoreo'),
        (N'CX-0003', N'Desarmador de precisión', N'Juego de 24 puntas magnéticas', N'Herramientas', N'pza', 85.00, 179.00, 15, 5, N'Estante B1', N'Ferretería Central'),
        (N'CX-0004', N'Hojas blancas carta', N'Paquete de 500 hojas 75g', N'Oficina', N'paquete', 70.00, 115.00, 25, 10, N'Bodega 1', N'Papelería del Centro'),
        (N'CX-0005', N'Limpiador multiusos 1L', N'Limpiador aroma lavanda', N'Limpieza', N'lt', 22.00, 39.00, 0, 6, N'Bodega 2', N'Distribuidora Limpia')
      ) AS v(Code, Name, Description, Category, Unit, Cost, Price, Qty, MinStock, Location, Supplier)
      LEFT JOIN dbo.Categories c ON c.Name = v.Category;

      INSERT INTO dbo.Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId)
      SELECT Id, 'IN', Quantity, 0, Quantity, N'Inventario inicial', @admin FROM dbo.Products WHERE Quantity > 0;`);
    console.log('[DB] Productos de demostración creados');
  }
}

export async function initDatabase(): Promise<void> {
  const dbName = config.db.database;
  for (let attempt = 1; ; attempt++) {
    try {
      const master = await new sql.ConnectionPool(connectionConfig('master')).connect();
      await master.request().query(`IF DB_ID(N'${dbName}') IS NULL CREATE DATABASE [${dbName}]`);
      await master.close();
      break;
    } catch (err: any) {
      if (attempt >= 40) throw err;
      console.log(`[DB] Esperando a SQL Server (intento ${attempt}): ${err.message}`);
      await sleep(3000);
    }
  }

  pool = await new sql.ConnectionPool(connectionConfig(dbName)).connect();
  for (const statement of SCHEMA) {
    await pool.request().query(statement);
  }
  await seed(pool);
  console.log(`[DB] Conectado a SQL Server, base de datos "${dbName}" lista`);
}
