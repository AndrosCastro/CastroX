import { Router, type Request } from 'express';
import sql from 'mssql';
import { z } from 'zod';
import { getPool } from '../db';
import { requireAdmin, requireAuth } from '../auth';
import { HttpError } from '../errors';
import { escapeLike, generateCode, nonNegative, optStr, sendCsv } from '../utils';
import { MOVEMENT_SELECT } from './movements';

const router = Router();
router.use(requireAuth);

export const PRODUCT_COLUMNS = `
  p.Id AS id, p.Code AS code, p.Name AS name, p.Description AS description,
  p.CategoryId AS categoryId, c.Name AS categoryName, c.Color AS categoryColor,
  p.Unit AS unit, p.Cost AS cost, p.Price AS price, p.Quantity AS quantity, p.MinStock AS minStock,
  p.Location AS location, p.Supplier AS supplier, p.CreatedAt AS createdAt, p.UpdatedAt AS updatedAt`;
export const PRODUCT_FROM = `FROM dbo.Products p LEFT JOIN dbo.Categories c ON c.Id = p.CategoryId`;

const categoryId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);

const baseSchema = z.object({
  code: optStr(100),
  name: z.string().trim().min(1).max(150),
  description: optStr(500),
  categoryId,
  unit: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((v) => v || 'pza'),
  cost: nonNegative.default(0),
  price: nonNegative.default(0),
  minStock: nonNegative.default(0),
  location: optStr(100),
  supplier: optStr(100),
});
const createSchema = baseSchema.extend({ quantity: nonNegative.default(0) });

function bindProduct(request: sql.Request, data: z.infer<typeof baseSchema>) {
  return request
    .input('code', sql.NVarChar(100), data.code)
    .input('name', sql.NVarChar(150), data.name)
    .input('description', sql.NVarChar(500), data.description)
    .input('categoryId', sql.Int, data.categoryId)
    .input('unit', sql.NVarChar(20), data.unit)
    .input('cost', sql.Decimal(18, 2), data.cost)
    .input('price', sql.Decimal(18, 2), data.price)
    .input('minStock', sql.Decimal(18, 2), data.minStock)
    .input('location', sql.NVarChar(100), data.location)
    .input('supplier', sql.NVarChar(100), data.supplier);
}

function buildFilters(req: Request, request: sql.Request): string {
  const where: string[] = ['1 = 1'];
  const search = String(req.query.search ?? '').trim();
  const cat = String(req.query.categoryId ?? '');
  const stock = String(req.query.stock ?? '');

  if (search) {
    where.push('(p.Name LIKE @s OR p.Code LIKE @s OR p.Description LIKE @s OR p.Supplier LIKE @s OR p.Location LIKE @s)');
    request.input('s', sql.NVarChar(200), `%${escapeLike(search)}%`);
  }
  if (cat === 'none') {
    where.push('p.CategoryId IS NULL');
  } else if (Number(cat) > 0) {
    where.push('p.CategoryId = @cat');
    request.input('cat', sql.Int, Number(cat));
  }
  if (stock === 'low') where.push('p.Quantity <= p.MinStock AND p.Quantity > 0');
  if (stock === 'out') where.push('p.Quantity <= 0');
  if (stock === 'alert') where.push('p.Quantity <= p.MinStock');
  if (stock === 'ok') where.push('p.Quantity > p.MinStock');
  return where.join(' AND ');
}

const SORTS: Record<string, string> = {
  name: 'p.Name',
  code: 'p.Code',
  quantity: 'p.Quantity',
  price: 'p.Price',
  updated: 'p.UpdatedAt',
  category: 'c.Name',
};

export async function findProduct(by: 'id' | 'code', value: string | number, request?: sql.Request) {
  const r = (request ?? getPool().request());
  if (by === 'id') r.input('pid', sql.Int, Number(value));
  else r.input('pcode', sql.NVarChar(100), String(value));
  const result = await r.query(`SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE ${by === 'id' ? 'p.Id = @pid' : 'p.Code = @pcode'}`);
  return result.recordset[0] ?? null;
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
  const sort = SORTS[String(req.query.sort)] || 'p.Name';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const request = getPool().request();
  const where = buildFilters(req, request);
  request.input('off', sql.Int, (page - 1) * pageSize).input('ps', sql.Int, pageSize);
  const r = await request.query(`
    SELECT ${PRODUCT_COLUMNS}, COUNT(*) OVER() AS total
    ${PRODUCT_FROM}
    WHERE ${where}
    ORDER BY ${sort} ${dir}, p.Id
    OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY`);

  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...rest }) => rest);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/export.csv', async (req, res) => {
  const request = getPool().request();
  const where = buildFilters(req, request);
  const r = await request.query(`SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE ${where} ORDER BY p.Name`);
  sendCsv(
    res,
    `castrox-productos-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Código', 'Nombre', 'Descripción', 'Categoría', 'Unidad', 'Costo', 'Precio', 'Cantidad', 'Stock mínimo', 'Valor (precio)', 'Ubicación', 'Proveedor', 'Actualizado'],
    r.recordset.map((p) => [
      p.code, p.name, p.description, p.categoryName, p.unit, p.cost, p.price, p.quantity, p.minStock,
      Math.round(p.quantity * p.price * 100) / 100, p.location, p.supplier, p.updatedAt,
    ]),
  );
});

router.get('/code/:code', async (req, res) => {
  const product = await findProduct('code', req.params.code.trim());
  if (!product) throw new HttpError(404, 'Producto no registrado');
  res.json(product);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const product = await findProduct('id', id);
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  const m = await getPool().request().input('id', sql.Int, id).query(`SELECT TOP 30 ${MOVEMENT_SELECT} WHERE m.ProductId = @id ORDER BY m.CreatedAt DESC, m.Id DESC`);
  res.json({ ...product, movements: m.recordset });
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  data.code = data.code || generateCode();

  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const ins = await bindProduct(new sql.Request(tx), data)
      .input('qty', sql.Decimal(18, 2), data.quantity)
      .query(`
        INSERT INTO dbo.Products (Code, Name, Description, CategoryId, Unit, Cost, Price, Quantity, MinStock, Location, Supplier)
        OUTPUT INSERTED.Id AS id
        VALUES (@code, @name, @description, @categoryId, @unit, @cost, @price, @qty, @minStock, @location, @supplier)`);
    const id = ins.recordset[0].id as number;
    if (data.quantity > 0) {
      await new sql.Request(tx)
        .input('pid', sql.Int, id)
        .input('q', sql.Decimal(18, 2), data.quantity)
        .input('uid', sql.Int, req.user!.id)
        .query(`INSERT INTO dbo.Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId) VALUES (@pid, 'IN', @q, 0, @q, N'Inventario inicial', @uid)`);
    }
    await tx.commit();
    res.status(201).json(await findProduct('id', id));
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = baseSchema.parse(req.body);
  const r = await bindProduct(getPool().request(), data)
    .input('id', sql.Int, id)
    .query(`
      UPDATE dbo.Products SET
        Code = COALESCE(@code, Code), Name = @name, Description = @description, CategoryId = @categoryId,
        Unit = @unit, Cost = @cost, Price = @price, MinStock = @minStock, Location = @location,
        Supplier = @supplier, UpdatedAt = SYSUTCDATETIME()
      WHERE Id = @id`);
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Producto no encontrado');
  res.json(await findProduct('id', id));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const r = await getPool().request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.Products WHERE Id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Producto no encontrado');
  res.json({ ok: true });
});

export default router;
