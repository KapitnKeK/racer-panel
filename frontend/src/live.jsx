import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'

const LiveCtx = createContext({ snap: null, connected: false, hist: { current: new Map() }, tick: 0 })
export const useLive = () => useContext(LiveCtx)

const HIST_MAX = 240

export function LiveProvider({ children, onUnauthorized }) {
  const [snap, setSnap] = useState(null)
  const [connected, setConnected] = useState(false)
  const [tick, setTick] = useState(0)
  const hist = useRef(new Map()) // "sid:uid" -> [{t,x,z,kmh,ping}]

  useEffect(() => {
    let es = null
    let timer = null
    let closed = false

    const ingest = (d) => {
      const now = Date.now()
      const alive = new Set()
      for (const s of d.servers || []) {
        for (const p of s.state.players || []) {
          const key = `${s.id}:${p.user_id}`
          alive.add(key)
          let arr = hist.current.get(key)
          if (!arr) { arr = []; hist.current.set(key, arr) }
          const last = arr[arr.length - 1]
          if (!last || last.x !== p.x || last.z !== p.z || now - last.t > 4000) {
            arr.push({ t: now, x: p.x, z: p.z, kmh: p.kmh, ping: p.ping })
            if (arr.length > HIST_MAX) arr.splice(0, arr.length - HIST_MAX)
          }
        }
      }
      for (const k of [...hist.current.keys()]) if (!alive.has(k)) hist.current.delete(k)
    }

    const connect = () => {
      es = new EventSource('/api/live')
      es.addEventListener('snapshot', (ev) => {
        try {
          const d = JSON.parse(ev.data)
          ingest(d)
          setSnap(d)
          setConnected(true)
        } catch { /* ignorieren */ }
      })
      es.onerror = async () => {
        setConnected(false)
        es.close()
        if (closed) return
        try { await api('/api/me') } catch (e) { if (e.status === 401) { onUnauthorized?.(); return } }
        timer = setTimeout(connect, 3000)
      }
    }
    connect()
    const iv = setInterval(() => setTick((t) => t + 1), 1000)
    return () => { closed = true; clearTimeout(timer); clearInterval(iv); es?.close() }
  }, [onUnauthorized])

  const value = useMemo(() => ({ snap, connected, hist, tick }), [snap, connected, tick])
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>
}
