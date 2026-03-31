import type { SchemaField } from '@common/types'

interface Props {
  schema: SchemaField[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}

export function SchemaForm({ schema, values, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {schema.map(field => (
        <SchemaFieldInput key={field.key} field={field} value={values[field.key]} onChange={v => onChange(field.key, v)} />
      ))}
    </div>
  )
}

function SchemaFieldInput({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  const labelStyle = {
    display: 'block',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-1)',
  }

  switch (field.type) {
    case 'text':
    case 'dice':
      return (
        <label>
          <span style={labelStyle}>{field.label}{field.required && ' *'}</span>
          <input
            type="text"
            value={(value as string) ?? field.default ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            style={{ width: '100%' }}
          />
        </label>
      )

    case 'number':
      return (
        <label>
          <span style={labelStyle}>{field.label}{field.required && ' *'}</span>
          <input
            type="number"
            value={(value as number) ?? field.default ?? ''}
            onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
            min={field.min}
            max={field.max}
            placeholder={field.placeholder}
            style={{ width: '100%' }}
          />
        </label>
      )

    case 'textarea':
      return (
        <label>
          <span style={labelStyle}>{field.label}{field.required && ' *'}</span>
          <textarea
            value={(value as string) ?? field.default ?? ''}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </label>
      )

    case 'select':
      return (
        <label>
          <span style={labelStyle}>{field.label}{field.required && ' *'}</span>
          <select
            value={(value as string) ?? field.default ?? ''}
            onChange={e => onChange(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">—</option>
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      )

    case 'multiselect':
      return (
        <label>
          <span style={labelStyle}>{field.label}{field.required && ' *'}</span>
          <select
            multiple
            value={(value as string[]) ?? []}
            onChange={e => {
              const selected = Array.from(e.target.selectedOptions, o => o.value)
              onChange(selected)
            }}
            style={{ width: '100%', minHeight: 80 }}
          >
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      )

    case 'boolean':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={(value as boolean) ?? field.default ?? false}
            onChange={e => onChange(e.target.checked)}
          />
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {field.label}
          </span>
        </label>
      )

    case 'group':
      return (
        <fieldset style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
          <legend style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', padding: '0 var(--space-1)' }}>
            {field.label}
          </legend>
          {field.fields && (
            <SchemaForm
              schema={field.fields}
              values={(value as Record<string, unknown>) ?? {}}
              onChange={(k, v) => {
                const group = { ...(value as Record<string, unknown> ?? {}), [k]: v }
                onChange(group)
              }}
            />
          )}
        </fieldset>
      )

    default:
      return null
  }
}
