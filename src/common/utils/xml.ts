// A small XML reader for well-formed files from other tools (Character Builder saves): elements,
// attributes, and text. No namespaces, DTDs, or validation; comments and processing instructions are skipped.

export interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  /** Text directly inside the element (CDATA included), entities decoded, not trimmed. */
  text: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e] ?? m
  })
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g

/** Parses a document and returns its root element. Throws on unbalanced tags. */
export function parseXml(input: string): XmlElement {
  const src = input.replace(/^﻿/, '')
  const root: XmlElement = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlElement[] = [root]
  let i = 0
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    const top = stack[stack.length - 1]
    if (lt < 0) { top.text += decodeEntities(src.slice(i)); break }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) { i = end(src, '-->', lt) ; continue }
    if (src.startsWith('<![CDATA[', lt)) {
      const close = src.indexOf(']]>', lt)
      if (close < 0) throw new Error('Unterminated CDATA')
      top.text += src.slice(lt + 9, close)
      i = close + 3
      continue
    }
    if (src.startsWith('<?', lt)) { i = end(src, '?>', lt); continue }
    if (src.startsWith('<!', lt)) { i = end(src, '>', lt); continue }
    const gt = tagEnd(src, lt)
    const body = src.slice(lt + 1, gt)
    i = gt + 1
    if (body[0] === '/') {
      const name = body.slice(1).trim()
      const open = stack.pop()
      if (!open || open === root || open.name !== name) throw new Error(`Unexpected </${name}>`)
      continue
    }
    const selfClosing = body.endsWith('/')
    const inner = selfClosing ? body.slice(0, -1) : body
    const name = inner.match(/^[^\s/>]+/)?.[0]
    if (!name) throw new Error(`Bad tag at ${lt}`)
    const attrs: Record<string, string> = {}
    for (const m of inner.slice(name.length).matchAll(ATTR)) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '')
    const el: XmlElement = { name, attrs, children: [], text: '' }
    top.children.push(el)
    if (!selfClosing) stack.push(el)
  }
  if (stack.length > 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`)
  const doc = root.children[0]
  if (!doc) throw new Error('No root element')
  return doc
}

function end(src: string, marker: string, from: number): number {
  const at = src.indexOf(marker, from)
  if (at < 0) throw new Error(`Unterminated ${src.slice(from, from + 4)}`)
  return at + marker.length
}

/** The `>` closing a tag, skipping quoted attribute values. */
function tagEnd(src: string, from: number): number {
  let quote = ''
  for (let i = from + 1; i < src.length; i++) {
    const ch = src[i]
    if (quote) { if (ch === quote) quote = ''; continue }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return i
  }
  throw new Error('Unterminated tag')
}

/** The first child element named `name`. */
export const child = (el: XmlElement | undefined, name: string): XmlElement | undefined =>
  el?.children.find(c => c.name === name)

/** All descendants named `name`, in document order. */
export function descendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (c.name === name) out.push(c)
    descendants(c, name, out)
  }
  return out
}
