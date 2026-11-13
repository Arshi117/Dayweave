// WebStorm: right-click this file and choose Run, or select "Dayweave 开发版".
// Keep this process running: renderer saves hot-reload; main/preload saves restart Electron.
process.env.DAYWEAVE_DEV_CONSOLE = '1'
require('./scripts/dev-launcher.cjs')
