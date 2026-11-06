// Gedeelde helper: pad naar de Python van de backend-venv (Windows én macOS/Linux).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const backendDir = path.join(root, 'backend')
const isWin = process.platform === 'win32'
export const venvPython = path.join(backendDir, '.venv', isWin ? 'Scripts' : 'bin', isWin ? 'python.exe' : 'python')

export function requireVenv() {
  if (!existsSync(venvPython)) {
    console.error('\nDe Python-omgeving van de backend ontbreekt. Voer eerst uit:  npm run setup\n')
    process.exit(1)
  }
  return venvPython
}
