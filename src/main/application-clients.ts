import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GoogleClient } from './google-oauth'

// Installed desktop OAuth clients are public application registrations, per
// https://developers.google.com/identity/protocols/oauth2/native-app.
// User authorization tokens are never packaged and remain profile-encrypted.
export function applicationClients(): { google?: GoogleClient; microsoftClientId?: string } {
  try {
    const data = JSON.parse(readFileSync(join(app.getAppPath(), 'build/desktop-clients.json'), 'utf8'))
    return {
      google: typeof data.google?.clientId === 'string' && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(data.google.clientId)
        ? { clientId: data.google.clientId, clientSecret: typeof data.google.clientSecret === 'string' ? data.google.clientSecret : undefined } : undefined,
      microsoftClientId: typeof data.microsoftClientId === 'string' && /^[0-9a-f-]{36}$/i.test(data.microsoftClientId) ? data.microsoftClientId : undefined,
    }
  } catch { return {} }
}
