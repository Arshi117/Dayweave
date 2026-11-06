const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const destination = path.join(root, 'build/desktop-clients.json')
let previous = {}
try { previous = JSON.parse(fs.readFileSync(destination, 'utf8')) } catch {}
let google = previous.google
if (process.env.DAYWEAVE_GOOGLE_CLIENT_FILE) {
  const { installed } = JSON.parse(fs.readFileSync(process.env.DAYWEAVE_GOOGLE_CLIENT_FILE, 'utf8'))
  if (!installed || typeof installed.client_id !== 'string' || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(installed.client_id)) throw Error('A Google Desktop app configuration is required; web clients are not accepted.')
  google = { clientId: installed.client_id, clientSecret: installed.client_secret || undefined }
}
const microsoftClientId = process.env.DAYWEAVE_MICROSOFT_CLIENT_ID || previous.microsoftClientId
if (!google || !/^[\w.-]+\.apps\.googleusercontent\.com$/.test(google.clientId)) throw Error('Set DAYWEAVE_GOOGLE_CLIENT_FILE to the Google Desktop app JSON before building a release.')
if (typeof microsoftClientId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(microsoftClientId)) throw Error('Set DAYWEAVE_MICROSOFT_CLIENT_ID before building a release.')
fs.mkdirSync(path.dirname(destination), { recursive: true })
// Google documents installed desktop client secrets as non-confidential.
// Only application registration is included, never account access/refresh tokens.
fs.writeFileSync(destination, JSON.stringify({ google: { clientId: google.clientId, clientSecret: google.clientSecret }, microsoftClientId }, null, 2) + '\n')
console.log('Desktop application registration prepared; no user authorization data included.')
