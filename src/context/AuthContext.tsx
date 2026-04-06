import { createContext, ReactNode, useContext, useState, useEffect } from 'react'
import { useAppBridge } from '@shopify/app-bridge-react'

import { normalizeShopifyDomain } from '../lib/misc'
import { setSessionTokenGetter } from '../lib/api'

type AuthProviderProps = {
  host: string
  shop: string
  children: ReactNode
}

export type AuthContext = {
  host: string
  shopifyDomain: string
  isLoading: boolean
  getSessionToken: () => Promise<string>
}

const AuthContext = createContext({} as AuthContext)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ host, shop, children }: AuthProviderProps) {
  const shopify = useAppBridge()
  const shopifyDomain = normalizeShopifyDomain(shop)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      console.log('Exchanging Shopify token for store:', shopifyDomain)
      // Inject session token getter into API layer
      setSessionTokenGetter(() => shopify.idToken())
      // Run in background without blocking
      setIsLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getSessionToken = async (): Promise<string> => {
    const maxRetries = 5
    let retryCount = 0

    while (retryCount < maxRetries) {
      try {
        const sessionToken = await shopify.idToken()
        return sessionToken
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
        getSessionToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
