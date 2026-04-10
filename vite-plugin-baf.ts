import type { Plugin } from 'vite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createDb } from './src/services/db'

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf-8')
    const env: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      env[key] = value
    }
    return env
  } catch {
    return {}
  }
}

export function bafPlugin(): Plugin {
  const env = loadEnv()

  const db = createDb({
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME ?? '',
    user: env.DB_USER ?? '',
    password: env.DB_PASSWORD ?? '',
  })

  return {
    name: 'baf',

    configureServer(server) {
      // GET /api/sessions?agent_name=MyAgent&username=john
      // DELETE /api/sessions?session_id=<id>
      server.middlewares.use('/api/sessions', async (req, res, next) => {
        const url = new URL(req.url ?? '', 'http://localhost')

        if (req.method === 'DELETE') {
          const sessionId = url.searchParams.get('session_id')
          if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ error: 'session_id is required' }))
          }
          try {
            await db.deleteSession(sessionId)
            res.writeHead(204)
            res.end()
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error('[baf] DB error:', msg)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: msg }))
          }
          return
        }

        if (req.method !== 'GET') return next()

        const agentName = url.searchParams.get('agent_name')
        const username = url.searchParams.get('username') ?? undefined

        if (!agentName) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'agent_name is required' }))
        }

        try {
          const sessions = await db.getSessions(agentName, username)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(sessions))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[baf] DB error:', msg)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: msg }))
        }
      })
    },
  }
}
