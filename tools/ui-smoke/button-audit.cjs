// Buttons must look like buttons before they are hovered. This runs in the renderer and lists every visible
// button with text that has neither a full border nor a fill distinct from what is behind it, i.e. one that
// reads as plain text. Icon-only buttons (no letters or digits) are exempt: the icon is the affordance.
// Rows of a list, menu, or tab strip are exempt by role (the row is the affordance), and so are `.ghost`
// value pickers (`aria-haspopup`), which share the dotted underline of the ghost selects around them.
// An action never uses `.ghost`.
// Usage in a smoke script: `const bad = await js(auditButtons)`.
function auditButtons() {
  const rgba = c => { const p = (c.match(/rgba?\(([^)]*)\)/)?.[1] ?? '0 0 0 0').split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
  const behind = el => { for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0.05) return c } return [255, 255, 255, 1] }
  const distinct = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 18
  const describe = b => {
    const parts = []
    for (let e = b; e && parts.length < 4 && e !== document.body; e = e.parentElement) { const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''; parts.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : '')) }
    return parts.join(' > ')
  }
  const out = []
  for (const b of document.querySelectorAll('button, [role="button"]')) {
    const r = b.getBoundingClientRect()
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(b)
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (!/[\p{L}\p{N}]/u.test(b.innerText)) continue
    if (b.matches('.ghost[aria-haspopup]') || b.closest('[role="tablist"], [role="listbox"], [role="menu"], [role="list"], [role="tree"], [role="navigation"], nav')) continue
    const border = ['Top', 'Right', 'Bottom', 'Left'].every(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && rgba(cs[`border${s}Color`])[3] > 0.2)
    const bg = rgba(cs.backgroundColor)
    const filled = bg[3] > 0.3 && distinct(bg, behind(b.parentElement))
    if (border || filled) continue
    out.push(`"${b.innerText.trim().replace(/\s+/g, ' ').slice(0, 40)}" at ${describe(b)}`)
  }
  return out
}

module.exports = { auditButtons }
