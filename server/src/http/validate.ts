import type { z } from 'zod'
import { badRequest } from './errors.ts'

/* Parses a body, params or query object with a Zod schema. On failure it throws
   a 400 naming the first bad field; on success it returns the typed value.

     const body = validate(createEntrySchema, req.body)                       */
export function validate<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue && issue.path.length > 0 ? issue.path.join('.') : null
  throw badRequest('invalid_input', field ? `Invalid value: ${field}.` : 'Invalid input.')
}
