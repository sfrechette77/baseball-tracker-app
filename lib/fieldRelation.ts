export type FieldRelation<T> = T[] | T | null | undefined

export function normalizeFieldRelation<T>(value: FieldRelation<T>): T[] | null {
  if (!value) return null
  return Array.isArray(value) ? value : [value]
}

export function getPrimaryField<T>(value: FieldRelation<T>): T | null {
  const normalized = normalizeFieldRelation(value)
  return normalized?.[0] ?? null
}