// D&D 4e disease HTML parser — build-time only

export interface ParsedDisease {
  name: string
  level: number
  flavor: string
  stages: { stage: number; text: string }[]
  check: string                               // descriptive text (skill + conditions)
  checkTable?: { result: string; effect: string }[]  // DC result table
  source: string
}

export interface DiseaseIndexEntry {
  id: string
  name: string
  level: number
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/^[ \t]+/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

function extractText(html: string, regex: RegExp): string {
  const m = html.match(regex)
  return m ? stripHtml(m[1]).trim() : ''
}

export function parseDiseaseHtml(html: string): ParsedDisease {
  const name = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() ?? 'Unknown'

  // Level
  const levelText = html.match(/class=level>([^<]+)/)?.[1]?.trim() ?? ''
  const level = parseInt(levelText.match(/Level\s+(\d+)/)?.[1] ?? '0')

  // Flavor
  const flavor = extractText(html, /<p class=['"]?flavor['"]?>\s*<i>([\s\S]*?)<\/i>/)

  // Parse stages and check from powerstat block
  const statBlock = html.match(/<p class=['"]?powerstat['"]?>([\s\S]*?)<\/p>/)
  const statHtml = statBlock ? statBlock[1] : ''

  const stages: { stage: number; text: string }[] = []
  let check = ''

  // Split by <b>Stage X</b> and <b>Check</b>
  // Use a regex to find all bold labels and their content
  const parts = statHtml.split(/<b>/)
  for (const part of parts) {
    if (!part.trim()) continue

    const stageMatch = part.match(/^Stage\s+(\d+)\s*<\/b>\s*:?\s*([\s\S]*?)$/)
    if (stageMatch) {
      const stageNum = parseInt(stageMatch[1])
      // The text runs until the next <b> tag (already split), but may contain trailing content
      let text = stripHtml(stageMatch[2])
      // Remove trailing Check section if it leaked in
      text = text.replace(/\nCheck:[\s\S]*$/, '').trim()
      stages.push({ stage: stageNum, text })
      continue
    }

    const checkMatch = part.match(/^Check\s*<\/b>\s*:?\s*([\s\S]*?)$/)
    if (checkMatch) {
      check = stripHtml(checkMatch[1])
      continue
    }
  }

  // Parse check into description + DC result table
  let checkDesc = check
  let checkTable: { result: string; effect: string }[] | undefined
  if (check) {
    const lines = check.split('\n').map(l => l.trim()).filter(Boolean)
    const descLines: string[] = []
    const tableRows: { result: string; effect: string }[] = []
    for (const line of lines) {
      const dcMatch = line.match(/^(.+?\s+or\s+(?:lower|higher)|.+?\d+[-–].+?\d+[^:]*|(?:Lower than\s+)?(?:Easy|Moderate|Hard)\s+DC):\s*(.+)/i)
      if (dcMatch) {
        tableRows.push({ result: dcMatch[1], effect: dcMatch[2] })
      } else {
        descLines.push(line)
      }
    }
    checkDesc = descLines.join('\n')
    if (tableRows.length > 0) checkTable = tableRows
  }

  // Source
  const source = extractText(html, /<p class=['"]?publishedIn['"]?>([\s\S]*?)<\/p>/).replace(/^Published in\s*/i, '')

  return { name, level, flavor, stages, check: checkDesc, checkTable, source }
}
