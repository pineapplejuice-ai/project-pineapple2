import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@nexbill/database';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/** Consistent error envelope: { statusCode, message, errors?, requestId }. Internals never leak. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');
  catch(e: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request & { id?: string }>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { message: 'Something went wrong' };
    if (e instanceof HttpException) {
      status = e.getStatus();
      const r = e.getResponse();
      body = typeof r === 'string' ? { message: r } : (r as Record<string, unknown>);
    } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      body = { message: `A record with the same ${String((e.meta?.target as string[] | undefined)?.filter((t) => !/tenantId|businessId/.test(t)).join(', ') || 'value')} already exists` };
    } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      status = HttpStatus.NOT_FOUND; body = { message: 'Record not found' };
    } else if ((e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2023') || e instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST; body = { message: 'Invalid identifier or value in the request' };
    } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
      status = HttpStatus.CONFLICT; body = { message: 'This record is in use and cannot be changed that way' };
    }
    if (status >= 500) this.log.error(JSON.stringify({ requestId: req.id, path: req.url, error: e instanceof Error ? e.stack : String(e) }));
    res.status(status).json({ statusCode: status, ...body, error: undefined, requestId: req.id });
  }
}

/** Request id + structured access log. */
export function requestLogger(req: Request & { id?: string }, res: Response, next: () => void): void {
  const log = new Logger('Access');
  req.id = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) ?? randomUUID();
  res.setHeader('x-request-id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.url.includes('/health')) return;
    log.log(JSON.stringify({ requestId: req.id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode,
      ms: Number((process.hrtime.bigint() - start) / 1000000n) }));
  });
  next();
}

export interface Page<T> { data: T[]; page: number; pageSize: number; total: number }
export const page = <T>(data: T[], total: number, q: { page: number; pageSize: number }): Page<T> =>
  ({ data, total, page: q.page, pageSize: q.pageSize });
export const skipTake = (q: { page: number; pageSize: number }): { skip: number; take: number } =>
  ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(from);
  if (to) { const d = new Date(to); if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setUTCHours(23, 59, 59, 999); r.lte = d; }
  return r;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown): string => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`; // neutralise spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
