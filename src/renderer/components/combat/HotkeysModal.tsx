export interface HotkeySection {
  title: string
  keys: { key: string; desc: string }[]
}

interface Props {
  sections: HotkeySection[]
  onClose: () => void
}

export function HotkeysModal({ sections, onClose }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: 'var(--space-6)',
        minWidth: 400, maxWidth: 500, maxHeight: '80vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 var(--space-4) 0' }}>Keyboard Shortcuts</h3>

        {sections.map(section => (
          <div key={section.title} style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>
              {section.title}
            </div>
            {section.keys.map(({ key, desc }) => (
              <div key={key + desc} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '2px 0', fontSize: 12 }}>
                <kbd style={{
                  minWidth: 80, textAlign: 'center',
                  padding: '1px 6px', borderRadius: 3,
                  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                  fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
                }}>{key}</kbd>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/** Hotkey definitions for each page */
export const GLOBAL_HOTKEYS: HotkeySection[] = [
  {
    title: 'Navigation',
    keys: [
      { key: 'G', desc: 'Go home' },
      { key: 'C', desc: 'Go to combat' },
      { key: '/', desc: 'Open command palette' },
      { key: 'Ctrl+K', desc: 'Open command palette' },
      { key: 'Ctrl+B', desc: 'Toggle sidebar' },
    ],
  },
]

export const COMBAT_HOTKEYS: HotkeySection[] = [
  {
    title: 'Turn Management',
    keys: [
      { key: 'Space', desc: 'Next turn' },
      { key: 'Y', desc: 'Delay (yield) current creature' },
    ],
  },
  {
    title: 'Targeting',
    keys: [
      { key: 'd / D', desc: 'Damage — single / multi target' },
      { key: 'h / H', desc: 'Heal — single / multi target' },
      { key: 'a / A', desc: 'Attack — single / multi target' },
    ],
  },
  {
    title: 'Attack Resolution',
    keys: [
      { key: 'h', desc: 'Mark target as hit' },
      { key: 'm', desc: 'Mark target as miss' },
      { key: 'Backspace', desc: 'Undo last hit/miss' },
      { key: 'Space', desc: 'Confirm / apply' },
    ],
  },
  {
    title: 'General',
    keys: [
      { key: 'Right-click', desc: 'Quick condition menu' },
      { key: 'Escape', desc: 'Cancel / close' },
    ],
  },
]
