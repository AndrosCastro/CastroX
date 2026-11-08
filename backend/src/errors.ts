import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  name: 'Nombre',
  description: 'Descripción',
  categoryId: 'Categoría',
  unit: 'Unidad',
  cost: 'Costo',
  price: 'Precio',
  quantity: 'Cantidad',
  minStock: 'Stock mínimo',
  location: 'Ubicación',
  supplier: 'Proveedor',
  type: 'Tipo',
  reason: 'Motivo',
  username: 'Usuario',
  fullName: 'Nombre completo',
  password: 'Contraseña',
  role: 'Rol',
  color: 'Color',
};

z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case 'invalid_type':
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'es obligatorio' : 'tiene un valor inválido' };
    case 'too_small':
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'es obligatorio' : `debe tener al menos ${issue.minimum} caracteres` };
      return { message: `debe ser mayor o igual a ${issue.minimum}` };
    case 'too_big':
      if (issue.type === 'string') return { message: `debe tener máximo ${issue.maximum} caracteres` };
      return { message: `debe ser menor o igual a ${issue.maximum}` };
    case 'invalid_enum_value':
      return { message: 'tiene un valor no permitido' };
    default:
      return { message: ctx.defaultError };
  }
});

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path?.[0] as string | undefined;
    const label = field ? FIELD_LABELS[field] || field : '';
    const message = issue?.code === 'custom' || !label ? issue?.message : `${label} ${issue.message}`;
    res.status(400).json({ error: message || 'Datos inválidos' });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  const sqlNumber = err?.number ?? err?.originalError?.info?.number;
  if (sqlNumber === 2627 || sqlNumber === 2601) {
    res.status(409).json({ error: 'Ya existe un registro con ese valor (código, nombre o usuario duplicado)' });
    return;
  }
  if (sqlNumber === 547) {
    res.status(409).json({ error: 'No se puede completar: el registro está relacionado con otros datos' });
    return;
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
