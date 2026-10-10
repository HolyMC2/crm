/* global console, process, URL */
// Proxy for kbd-walk.mjs on a lane test site: the lane's built crm frontend
// from this worktree, /crm pages rendered from the built crm.html with a boot
// assembled from the Desk boot of the same session (the runtime's crm snapshot
// is the committed tree, without the built crm.html), everything else to the
// runtime. Local testing only.
// usage: node kbd-walk-proxy.mjs <listen-port> <runtime-base-url> <crm-repo-dir>
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const [port, upstream, crmDir] = process.argv.slice(2)
const up = new URL(upstream)
const built = path.join(crmDir, 'crm/public/frontend')
const shellHtml = fs.readFileSync(path.join(crmDir, 'crm/www/crm.html'), 'utf8')
const NEUTRAL = new Set([
  'hoy',
  'pendientes',
  'agenda',
  'contactos',
  'cobranza',
  'compras',
  'gastos',
  'garantias',
  'avisos',
  'archivos',
  'not-permitted',
])
const TYPES = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

function forward(req, res, body) {
  const r = http.request(
    {
      host: up.hostname,
      port: up.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: up.host },
    },
    (u) => {
      res.writeHead(u.statusCode, u.headers)
      u.pipe(res)
    },
  )
  r.on('error', (e) => {
    res.writeHead(502)
    res.end(String(e))
  })
  if (body !== undefined) r.end(body)
  else req.pipe(r)
}

function get(url, cookie) {
  return new Promise((resolve, reject) => {
    http
      .get(
        {
          host: up.hostname,
          port: up.port,
          path: url,
          headers: { cookie: cookie || '', host: up.host },
        },
        (r) => {
          let data = ''
          r.on('data', (c) => (data += c))
          r.on('end', () => resolve({ status: r.statusCode, data }))
        },
      )
      .on('error', reject)
  })
}

async function crmPage(req, res) {
  const desk = await get('/desk', req.headers.cookie)
  const bootMatch = /frappe\.boot = (\{.*\});?\s*$/m.exec(desk.data)
  const csrf = /frappe\.csrf_token = "([^"]*)"/.exec(desk.data)
  if (!bootMatch) {
    res.writeHead(302, {
      location: '/login?redirect-to=' + encodeURIComponent(req.url),
    })
    return res.end()
  }
  const b = JSON.parse(bootMatch[1])
  const segment = req.url.split('?')[0].split('/')[2] || ''
  const neutral = NEUTRAL.has(segment)
  const boot = {
    frappe_version: b.versions?.frappe,
    installed_apps: Object.keys(b.versions || {}),
    default_route: neutral ? `/crm/${segment}` : '/crm',
    muelle_module: neutral ? segment : 'ventas',
    site_name: b.sitename,
    lang: b.lang,
    csrf_token: csrf?.[1] || '',
    setup_complete: 1,
    sysdefaults: b.sysdefaults,
    translated_doctypes: [],
    translated_messages: b.__messages || {},
    timezone: {
      system: b.time_zone?.system,
      user: b.time_zone?.user || b.time_zone?.system,
    },
    state_options: {},
  }
  const script = Object.entries(boot)
    .map(
      ([k, v]) =>
        `window[${JSON.stringify(k)}] = ${JSON.stringify(v ?? null)};`,
    )
    .join('\n')
  const html = shellHtml.replace(
    /\{% for key in boot %\}[\s\S]*?\{% endfor %\}/,
    script,
  )
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(html)
}

http
  .createServer((req, res) => {
    const pathname = req.url.split('?')[0]
    if (pathname.startsWith('/assets/crm/frontend/')) {
      const file = path.join(
        built,
        pathname.slice('/assets/crm/frontend/'.length),
      )
      if (
        file.startsWith(built) &&
        fs.existsSync(file) &&
        fs.statSync(file).isFile()
      ) {
        res.writeHead(200, {
          'content-type':
            TYPES[path.extname(file)] || 'application/octet-stream',
        })
        return fs.createReadStream(file).pipe(res)
      }
    }
    if (
      req.method === 'GET' &&
      (pathname === '/crm' || pathname.startsWith('/crm/'))
    )
      return crmPage(req, res).catch((e) => {
        res.writeHead(500)
        res.end(String(e))
      })
    forward(req, res)
  })
  .listen(Number(port), '127.0.0.1', () =>
    console.log(`proxy on http://127.0.0.1:${port}`),
  )
