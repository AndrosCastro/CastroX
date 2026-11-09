import type { Response } from 'express';
import { z } from 'zod';

/** Texto opcional: cadenas vacías se guardan como NULL */
export const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const nonNegative = z.coerce.number().min(0).max(9_999_999_999);

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Escapa los comodines de LIKE/ILIKE (en Postgres el carácter de escape por defecto es \) */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export function generateCode(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `CX-${t}${r}`;
}

export function sendCsv(res: Response, filename: string, headers: string[], rows: unknown[][]): void {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
}
