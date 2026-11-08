export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Fehler ${status}`)
    this.status = status
  }
}

function fmtDetail(d) {
  if (!d) return null
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join('.') || 'Feld'}: ${e.msg}`).join(' · ')
  return JSON.stringify(d)
}

export async function api(path, { method = 'GET', body } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Requested-With': 'r3e-panel' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Panel')
  }
  let data = null
  try { data = await res.json() } catch { /* leer */ }
  if (!res.ok) throw new ApiError(res.status, fmtDetail(data?.detail))
  return data
}

export const ROLE_LABEL = { viewer: 'Zuschauer', host: 'Host', admin: 'Admin' }
export const can = (user, role) => ({ viewer: 1, host: 2, admin: 3 }[user?.role] || 0) >= { viewer: 1, host: 2, admin: 3 }[role]
