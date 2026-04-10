/** Simple dice rolling utilities */

export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}
