import type { ReactNode } from 'react'

// The small markdown subset agents write in descriptions: headings, lists, paragraphs,
// **bold**, *italic*, `code`, and [links](https://…). Anything else stays literal text.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('[')) {
      const [, label, url] = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
      // Main opens target=_blank links in the system browser; only web links are live.
      return /^https?:\/\//.test(url) ? <a key={i} href={url} target="_blank" rel="noreferrer">{label}</a> : label
    }
    return <i key={i}>{part.slice(1, -1)}</i>
  })
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = [], para: string[] = []
  const flush = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>)
    para = []; list = []
  }
  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)
    if (heading) { flush(); blocks.push(heading[1].length <= 2 ? <h3 key={blocks.length}>{inline(heading[2])}</h3> : <h4 key={blocks.length}>{inline(heading[2])}</h4>) }
    else if (item) { if (para.length) flush(); list.push(item[1]) }
    else if (!line.trim()) flush()
    else if (list.length && /^\s+/.test(line)) list[list.length - 1] += ' ' + line.trim()
    else { if (list.length) flush(); para.push(line.trim()) }
  }
  flush()
  return <div className="authoring-markdown">{blocks}</div>
}
