import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from './app-settings'

describe('normalizeAppSettings', () => {
  it('defaults to following the system theme', () => {
    expect(DEFAULT_APP_SETTINGS.theme).toBe('system')
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS)
    expect(normalizeAppSettings({})).toEqual(DEFAULT_APP_SETTINGS)
    expect(normalizeAppSettings('dark')).toEqual(DEFAULT_APP_SETTINGS)
  })

  it('keeps a valid stored theme', () => {
    expect(normalizeAppSettings({ theme: 'light' }).theme).toBe('light')
    expect(normalizeAppSettings({ theme: 'dark' }).theme).toBe('dark')
  })

  it('replaces an unknown theme with the default', () => {
    expect(normalizeAppSettings({ theme: 'solarized' }).theme).toBe('system')
  })
})
