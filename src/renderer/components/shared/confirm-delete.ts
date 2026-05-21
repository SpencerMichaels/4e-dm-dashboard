/** Shared delete confirmation. Returns true if the user confirms. */
export function confirmDelete(entityName: string, entityType?: string): boolean {
  const label = entityType ? `${entityType} "${entityName}"` : `"${entityName}"`
  return window.confirm(`Delete ${label}? This cannot be undone.`)
}
