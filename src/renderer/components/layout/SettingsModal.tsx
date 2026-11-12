import { useUiStore } from '../../stores/ui-store'
import { useSettingsStore } from '../../stores/settings-store'
import { Modal } from '../shared/Modal'
import type { SystemSettingDef } from '@common/types/system-plugin'

// Rules settings stay under systems['dnd-4e'] in localStorage for compatibility.
const RULES_SETTINGS_KEY = 'dnd-4e'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const settings = useSettingsStore()

  const systemDefs: SystemSettingDef[] = systemPlugin?.settings ?? []

  return (
    <Modal onClose={onClose} minWidth={520}>
      {/* Header */}
      <div style={{
        marginBottom: 'var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: 'var(--space-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Settings</h2>
        <button onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-muted)', fontSize: 16, lineHeight: 1, padding: 0,
          }}>×</button>
      </div>

      {/* Body */}
      <div>
        <SettingsSection title="General">
          <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
            No general settings yet.
          </div>
        </SettingsSection>

        {systemPlugin && (
          <SettingsSection title={systemPlugin.name}>
            {systemDefs.length === 0 ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
                This system has no configurable settings.
              </div>
            ) : (
              systemDefs.map((def) => (
                <SystemSettingRow key={def.key}
                  def={def}
                  value={settings.systems[RULES_SETTINGS_KEY]?.[def.key] ?? def.default}
                  onChange={(v) => settings.setSystemSetting(RULES_SETTINGS_KEY, def.key, v)} />
              ))
            )}
          </SettingsSection>
        )}
      </div>
    </Modal>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--space-5)' }}>
      <h3 style={{
        margin: '0 0 var(--space-2)',
        fontSize: 'var(--font-size-xs)', fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: 'var(--space-1)',
      }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {children}
      </div>
    </section>
  )
}

function SystemSettingRow({ def, value, onChange }: {
  def: SystemSettingDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (def.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer', padding: '4px 0' }}>
        <input type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ marginTop: 2, cursor: 'pointer' }} />
        <span>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{def.label}</div>
          {def.description && (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
              {def.description}
            </div>
          )}
        </span>
      </label>
    )
  }
  if (def.type === 'select' && def.options) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '4px 0' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{def.label}</span>
        {def.description && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{def.description}</span>
        )}
        <select value={value as string} onChange={(e) => onChange(e.target.value)}>
          {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    )
  }
  if (def.type === 'number') {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '4px 0' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{def.label}</span>
        {def.description && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{def.description}</span>
        )}
        <input type="number" value={value as number}
          onChange={(e) => onChange(Number(e.target.value))} />
      </label>
    )
  }
  // string
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '4px 0' }}>
      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{def.label}</span>
      {def.description && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{def.description}</span>
      )}
      <input type="text" value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
