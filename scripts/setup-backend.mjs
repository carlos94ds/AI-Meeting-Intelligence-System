// Maakt backend/.venv aan en installeert de Python-afhankelijkheden.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { backendDir, venvPython } from './backend-python.mjs'

const candidates = process.platform === 'win32' ? [['py', ['-3.11']], ['py', ['-3']], ['python', []]] : [['python3.11', []], ['python3', []]]

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: backendDir, stdio: 'inherit', shell: false })
  return r.status === 0
}

if (!existsSync(venvPython)) {
  const ok = candidates.some(([cmd, pre]) => run(cmd, [...pre, '-m', 'venv', '.venv']))
  if (!ok) {
    console.error('Kon geen Python 3.11+ vinden. Installeer Python 3.11 of nieuwer en probeer opnieuw.')
    process.exit(1)
  }
}
if (!run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip']) || !run(venvPython, ['-m', 'pip', 'install', '-r', 'requirements-dev.txt'])) {
  process.exit(1)
}
console.log('\nBackend klaar. Start alles met:  npm run dev\n')
