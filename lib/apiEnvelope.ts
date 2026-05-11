export type ApiMeta = Record<string, unknown>

export function ok<T>(data: T, init: ResponseInit = {}, meta: ApiMeta = {}) {
  return Response.json({ data, error: null, meta }, init)
}

export function fail(message: string, status = 400, details: Record<string, unknown> = {}, meta: ApiMeta = {}) {
  return Response.json(
    {
      data: null,
      error: { message, ...details },
      meta,
    },
    { status },
  )
}

export function fieldFail(fields: Record<string, string>, status = 422) {
  return Response.json(
    {
      data: null,
      error: { message: 'Validation failed.', fields },
      meta: {},
    },
    { status },
  )
}
