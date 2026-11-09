import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'

const GamesCtx = createContext({ games: [], byKey: {} })
export const useGames = () => useContext(GamesCtx)

export function GamesProvider({ children }) {
  const [games, setGames] = useState([])
  useEffect(() => { api('/api/games').then(setGames).catch(() => {}) }, [])
  const value = useMemo(() => ({ games, byKey: Object.fromEntries(games.map((g) => [g.key, g])) }), [games])
  return <GamesCtx.Provider value={value}>{children}</GamesCtx.Provider>
}

// Hat der Server (bzw. sein Spiel) die Fähigkeit? Ältere Antworten ohne caps gelten als "kann alles".
export const hasCap = (server, cap) => !server?.caps || server.caps.includes(cap)

export function GameBadge({ game, className = '' }) {
  const { byKey } = useGames()
  const g = byKey[game]
  if (!g) return null
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}
      style={{ borderColor: `${g.color}66`, color: g.color, background: `${g.color}1a` }} title={g.name}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />{g.short}
    </span>
  )
}
