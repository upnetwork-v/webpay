import { fetchInstance } from './index'

/**
 * 获取token
 */

export type getSumsubTokenResponse = {
  code: number
  data: getSumsubTokenData
  msg: string
}

export type getSumsubTokenData = {
  token: string
  userId: string
}

export async function getSumsubToken(): Promise<getSumsubTokenData | null> {
  try {
    const response = await fetchInstance.post<getSumsubTokenResponse>(
      `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/kyc/sumsub_token`
    )
    if (response.code === 200) {
      return response.data as getSumsubTokenData | null
    }
    return null
  } catch (error) {
    console.error('Failed to get KYC token:', error)
    return null
  }
}
