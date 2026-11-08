// Start de backend (standaard), of: `seed [--reset]`, of: `test`.
import { spawn } from 'node:child_process'
import { backendDir, requireVenv } from './backend-python.mjs'

const python = requireVenv()
const [mode, ...rest] = process.argv.slice(2)
const args =
  mode === 'seed'
    ? ['-m', 'app.seed', ...rest]
    : mode === 'test'
      ? ['-m', 'pytest', ...rest]
      : mode === 'schemas'
        ? ['-m', 'app.ai.export_schemas']
        : mode === 'pip'
          ? ['-m', 'pip', ...rest]
      : ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000']

const child = spawn(python, args, { cwd: backendDir, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig))
