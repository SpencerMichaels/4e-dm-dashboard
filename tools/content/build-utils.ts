/** Extract the first publication name from a source string like "Monster Manual, page(s) 235, Dungeon Delve, page(s) 37" */
export function extractFirstBook(source: string): string {
  if (!source) return ''
  const match = source.match(/^(.+?),\s*page/)
  return match ? match[1].trim() : source.split(',')[0].trim()
}
