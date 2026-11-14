import { useUiStore } from '../../stores/ui-store'
import { useSettingsStore } from '../../stores/settings-store'
import { Modal } from '../shared/Modal'
import { CopyConnectionPath, CopyMcpSetup, WorkshopIntro } from '../authoring/EntryEditor'
import type { SystemSettingDef } from '@common/types/system-plugin'
import { THEME_PREFERENCES, THEME_PREFERENCE_LABELS, type ThemePreference } from '@kit/theme'

// Rules settings stay under systems['dnd-4e'] in localStorage for compatibility.
const RULES_SETTINGS_KEY = 'dnd-4e'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const systemPlugin = useUiStore((s) => s.systemPlugin)
  const themePreference = useUiStore((s) => s.themePreference)
  const setThemePreference = useUiStore((s) => s.setThemePreference)
  const agentConnection = useUiStore((s) => s.agentConnection)
  const setAgentConnection = useUiStore((s) => s.setAgentConnection)
  const settings = useSettingsStore()

  const systemDefs: SystemSettingDef[] = systemPlugin?.settings ?? []

  return (
    <Modal title="Settings" onClose={onClose} minWidth={520} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div>
        <SettingsSection title="General">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '4px 0' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Theme</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>
              Applies to both windows. Saved in app-settings.json.
            </span>
            <select value={themePreference}
              onChange={(e) => setThemePreference(e.target.value as ThemePreference)}>
              {THEME_PREFERENCES.map((p) => <option key={p} value={p}>{THEME_PREFERENCE_LABELS[p]}</option>)}
            </select>
          </label>
        </SettingsSection>

        {systemPlugin && (
          <SettingsSection title={systemPlugin.name}>
            {systemDefs.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>
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

        <SettingsSection title="AI agent">
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={agentConnection} onChange={e => setAgentConnection(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Let a local AI agent connect</span>
              <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>
                For a coding agent such as Claude Code on this computer (MCP server or CLI): it can work on the entry you have open, and you comment on its stat block lines.
              </span>
            </span>
          </label>
          {agentConnection && <>
            <div className="authoring"><WorkshopIntro /></div>
            <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}><CopyMcpSetup /><CopyConnectionPath /></div>
          </>}
        </SettingsSection>
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
        color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        borderBottom: '1px solid var(--border)',
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
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)', marginTop: 1 }}>
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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>{def.description}</span>
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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>{def.description}</span>
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
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--muted)' }}>{def.description}</span>
      )}
      <input type="text" value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
