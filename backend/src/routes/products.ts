import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, transaction, type Params, type Queryable } from '../db';
import { requireAdmin, requireAuth } from '../auth';
import { HttpError } from '../errors';
import { escapeLike, generateCode, nonNegative, optStr, sendCsv } from '../utils';
import { MOVEMENT_SELECT } from './movements';

const router = Router();
router.use(requireAuth);

export const PRODUCT_COLUMNS = `
  p.Id AS id, p.Code AS code, p.Name AS name, p.Description AS description,
  p.CategoryId AS "categoryId", c.Name AS "categoryName", c.Color AS "categoryColor",
  p.Unit AS unit, p.Cost AS cost, p.Price AS price, p.Quantity AS quantity, p.MinStock AS "minStock",
  p.Location AS location, p.Supplier AS supplier, p.CreatedAt AS "createdAt", p.UpdatedAt AS "updatedAt"`;
export const PRODUCT_FROM = `FROM Products p LEFT JOIN Categories c ON c.Id = p.CategoryId`;

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

function productParams(data: z.infer<typeof baseSchema>): Params {
  return {
    code: data.code,
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    unit: data.unit,
    cost: data.cost,
    price: data.price,
    minStock: data.minStock,
    location: data.location,
    supplier: data.supplier,
  };
}

function buildFilters(req: Request, params: Params): string {
  const where: string[] = ['1 = 1'];
  const search = String(req.query.search ?? '').trim();
  const cat = String(req.query.categoryId ?? '');
  const stock = String(req.query.stock ?? '');

  if (search) {
    where.push('(p.Name ILIKE @s OR p.Code ILIKE @s OR p.Description ILIKE @s OR p.Supplier ILIKE @s OR p.Location ILIKE @s)');
    params.s = `%${escapeLike(search)}%`;
  }
  if (cat === 'none') {
    where.push('p.CategoryId IS NULL');
  } else if (Number(cat) > 0) {
    where.push('p.CategoryId = @cat');
    params.cat = Number(cat);
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

export async function findProduct(by: 'id' | 'code', value: string | number, db?: Queryable) {
  const r = await query(
    `SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE ${by === 'id' ? 'p.Id = @pid' : 'p.Code = @pcode'}`,
    by === 'id' ? { pid: Number(value) } : { pcode: String(value) },
    db,
  );
  return r.rows[0] ?? null;
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
  const sort = SORTS[String(req.query.sort)] || 'p.Name';
  const dir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

  const params: Params = { off: (page - 1) * pageSize, ps: pageSize };
  const where = buildFilters(req, params);
  const r = await query(
    `
    SELECT ${PRODUCT_COLUMNS}, COUNT(*) OVER() AS total
    ${PRODUCT_FROM}
    WHERE ${where}
    ORDER BY ${sort} ${dir} NULLS LAST, p.Id
    OFFSET @off LIMIT @ps`,
    params,
  );

  const total = r.rows[0]?.total ?? 0;
  const items = r.rows.map(({ total: _t, ...rest }) => rest);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/export.csv', async (req, res) => {
  const params: Params = {};
  const where = buildFilters(req, params);
  const r = await query(`SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE ${where} ORDER BY p.Name`, params);
  sendCsv(
    res,
    `castrox-productos-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Código', 'Nombre', 'Descripción', 'Categoría', 'Unidad', 'Costo', 'Precio', 'Cantidad', 'Stock mínimo', 'Valor (precio)', 'Ubicación', 'Proveedor', 'Actualizado'],
    r.rows.map((p) => [
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
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Producto no encontrado');
  const product = await findProduct('id', id);
  if (!product) throw new HttpError(404, 'Producto no encontrado');
  const m = await query(`SELECT ${MOVEMENT_SELECT} WHERE m.ProductId = @id ORDER BY m.CreatedAt DESC, m.Id DESC LIMIT 30`, { id });
  res.json({ ...product, movements: m.rows });
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  data.code = data.code || generateCode();

  const id = await transaction(async (tx) => {
    const ins = await query(
      `INSERT INTO Products (Code, Name, Description, CategoryId, Unit, Cost, Price, Quantity, MinStock, Location, Supplier)
       VALUES (@code, @name, @description, @categoryId, @unit, @cost, @price, @qty, @minStock, @location, @supplier)
       RETURNING Id AS id`,
      { ...productParams(data), qty: data.quantity },
      tx,
    );
    const newId = ins.rows[0].id as number;
    if (data.quantity > 0) {
      await query(
        `INSERT INTO Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId) VALUES (@pid, 'IN', @q, 0, @q, 'Inventario inicial', @uid)`,
        { pid: newId, q: data.quantity, uid: req.user!.id },
        tx,
      );
    }
    return newId;
  });
  res.status(201).json(await findProduct('id', id));
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = baseSchema.parse(req.body);
  const r = await query(
    `
      UPDATE Products SET
        Code = COALESCE(@code, Code), Name = @name, Description = @description, CategoryId = @categoryId,
        Unit = @unit, Cost = @cost, Price = @price, MinStock = @minStock, Location = @location,
        Supplier = @supplier, UpdatedAt = now()
      WHERE Id = @id`,
    { ...productParams(data), id },
  );
  if (!r.rowCount) throw new HttpError(404, 'Producto no encontrado');
  res.json(await findProduct('id', id));
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const r = await query('DELETE FROM Products WHERE Id = @id', { id: Number(req.params.id) });
  if (!r.rowCount) throw new HttpError(404, 'Producto no encontrado');
  res.json({ ok: true });
});

export default router;
