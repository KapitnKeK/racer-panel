import { createContext, useContext } from 'react'

export const AuthCtx = createContext({ user: null, logout: () => {} })
export const useAuth = () => useContext(AuthCtx)
