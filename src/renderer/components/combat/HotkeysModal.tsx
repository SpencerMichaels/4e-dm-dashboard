import { Modal, modalStyles } from '../shared/Modal'

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
    <Modal onClose={onClose} minWidth={400} maxWidth={500}>
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
                padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)',
                fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
              }}>{key}</kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onClose} className={modalStyles.btnSecondary}>Close</button>
      </div>
    </Modal>
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
