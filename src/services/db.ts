import pg from 'pg'

const { Pool } = pg

export interface DbCredentials {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface SessionRecord {
  id: number
  session_id: string
  session_name: string | null
  platform_name: string
  timestamp: string
}

export function createDb(credentials: DbCredentials) {
  const pool = new Pool(credentials)

  return {
    /**
     * Retrieve all sessions for a given agent name, optionally filtered by username.
     * Returns sessions ordered newest first.
     */
    async getSessions(agentName: string, username?: string): Promise<SessionRecord[]> {
      const params: unknown[] = [agentName]
      if (username) params.push(username)
      const result = await pool.query<SessionRecord>(
        `SELECT id, session_id, session_name, platform_name, timestamp
         FROM session
         WHERE agent_name = $1${username ? ' AND username = $2' : ''}
         ORDER BY timestamp DESC`,
        params,
      )
      return result.rows
    },

    async deleteSession(sessionId: string): Promise<void> {
      await pool.query('DELETE FROM session WHERE session_id = $1', [sessionId])
    },

    async end() {
      await pool.end()
    },
  }
}
