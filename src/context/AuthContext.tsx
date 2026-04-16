import { createContext, ReactNode, useContext, useState, useEffect } from 'react'
import { useAppBridge } from '@shopify/app-bridge-react'

import { normalizeShopifyDomain } from '../lib/misc'
import { setSessionTokenGetter } from '../lib/api'

type AuthProviderProps = {
  host: string
  shop: string
  isNewInstall: boolean | null
  children: ReactNode
}

export type AuthContextValue = {
  host: string
  shopifyDomain: string
  isLoading: boolean
  isNewInstall: boolean | null
  getSessionToken: () => Promise<string>
}

const AuthContext = createContext({} as AuthContextValue)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ host, shop, isNewInstall, children }: AuthProviderProps) {
  const shopify = useAppBridge()
  // App Bridge config carries the shop — fall back to it when the URL param
  // is absent (e.g. after client-side navigation drops ?shop=).
  const resolvedShop = shop || (shopify as { config?: { shop?: string } }).config?.shop || ''
  const shopifyDomain = normalizeShopifyDomain(resolvedShop)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setSessionTokenGetter(() => shopify.idToken())
    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getSessionToken = async (): Promise<string> => {
    const maxRetries = 5
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        return await shopify.idToken()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`Attempt ${retryCount + 1} failed: ${errorMessage}`)
        retryCount++

        if (retryCount === maxRetries) {
          console.error('Max retries reached. Giving up.')
          throw error
        }

        await new Promise(r => setTimeout(r, 500))
      }
    }

    throw new Error('Failed to get session token')
  }

  return (
    <AuthContext.Provider
      value={{
        host,
        isLoading,
        shopifyDomain,
        isNewInstall,
        getSessionToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
