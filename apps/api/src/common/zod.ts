import { applyDecorators, BadRequestException, Body, PipeTransform, Query } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}
  transform(value: unknown): unknown {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return r.data;
  }
}
/** Validated request body; the same Zod schema drives the web forms and the OpenAPI document. */
export const ZBody = (schema: ZodTypeAny): ParameterDecorator => Body(new ZodPipe(schema));
export const ZQuery = (schema: ZodTypeAny): ParameterDecorator => Query(new ZodPipe(schema));
export const ApiZod = (schema: ZodTypeAny): MethodDecorator =>
  applyDecorators(ApiBody({ schema: toJsonSchema(schema) as never }));
// typed loosely on purpose: the library's generic return type is too deep for tsc on large schemas
const toJsonSchema = (schema: unknown): unknown =>
  (zodToJsonSchema as (s: unknown, o: unknown) => unknown)(schema, { target: 'openApi3', $refStrategy: 'none' });
