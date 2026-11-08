// Maakt screenshots van de belangrijkste schermen met een lokale Chrome/Edge (headless, geen extra pakketten).
//
// Gebruik (app moet draaien via `npm run dev`):
//   npm run screenshots                       -> docs/screenshots/*.png (licht + donker, laptop)
//   npm run screenshots -- --sizes laptop,tablet,mobiel --themes light
//   CHROME_PATH="C:\Pad\naar\chrome.exe" npm run screenshots
//   APP_URL=http://localhost:5173 npm run screenshots
//
// Vereist Node 22+ (ingebouwde WebSocket) en Google Chrome, Chromium of Microsoft Edge.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { root } from './backend-python.mjs'

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173'
const OUT = path.join(root, 'docs', 'screenshots')
const PORT = 9400 + Math.floor(Math.random() * 400)

const SIZES = { laptop: [1440, 960], tablet: [820, 1180], mobiel: [390, 844] }
const PAGES = [
  { name: 'dashboard', path: '/' },
  { name: 'vergadering-samenvatting', path: '/vergaderingen/3' },
  { name: 'vergadering-review', path: '/vergaderingen/3?tab=actiepunten' },
  { name: 'vergelijking', path: '/vergaderingen/3?tab=vergelijking' },
  { name: 'actiepunten-kanban', path: '/actiepunten?weergave=kanban' },
  { name: 'actiepunt-historie', path: '/actiepunten?item=3' },
  { name: 'project-voortgang', path: '/projecten/1?tab=voortgang' },
  { name: 'voorbereiding', path: '/projecten/1?tab=voorbereiding' },
  { name: 'wizard', path: '/vergaderingen/nieuw' },
  { name: 'instellingen', path: '/instellingen' },
]

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].split(',') : fallback
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  for (const cmd of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' })
    if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim()
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve)
          ws.addEventListener('error', reject)
        })
        return ws
      }
    } catch {
      /* browser start nog op */
    }
    await sleep(250)
  }
  throw new Error('Kon geen verbinding maken met de browser.')
}

async function main() {
  if (typeof WebSocket === 'undefined') throw new Error('Node 22 of nieuwer is nodig (ingebouwde WebSocket).')
  try {
    await fetch(`${APP_URL}/api/health`)
  } catch {
    throw new Error(`De app draait niet op ${APP_URL}. Start eerst: npm run dev`)
  }
  const browser = findBrowser()
  if (!browser) throw new Error('Geen Chrome, Chromium of Edge gevonden. Zet CHROME_PATH naar het programma.')

  const sizes = arg('sizes', ['laptop'])
  const themes = arg('themes', ['light', 'dark'])
  mkdirSync(OUT, { recursive: true })
  const profile = mkdtempSync(path.join(os.tmpdir(), 'ami-shots-'))
  const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

  try {
    const ws = await connect()
    let id = 0
    const pending = new Map()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    })
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params }))
      })

    await send('Page.enable')
    for (const theme of themes) {
      // Thema wordt door de app uit localStorage gelezen
      await send('Page.navigate', { url: APP_URL })
      await sleep(1200)
      await send('Runtime.evaluate', { expression: `localStorage.setItem('ami-theme', '${theme}'); localStorage.removeItem('ami-project')` })
      for (const size of sizes) {
        const [width, height] = SIZES[size] ?? SIZES.laptop
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: size === 'mobiel' })
        for (const page of PAGES) {
          await send('Page.navigate', { url: APP_URL + page.path })
          await sleep(2200)
          const shot = await send('Page.captureScreenshot', { format: 'png' })
          const file = path.join(OUT, `${page.name}-${theme === 'dark' ? 'donker' : 'licht'}${size === 'laptop' ? '' : `-${size}`}.png`)
          writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
          console.log('✓', path.relative(root, file))
        }
      }
    }
    ws.close()
  } finally {
    proc.kill()
    await sleep(300)
    rmSync(profile, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(`\n${e.message}\n`)
  process.exit(1)
})
