import { fetchInstance } from './index'

/**
 * (siws)生成message
 */
export interface GenerateMessageRequest {
  address: string
  /**
   * 主网：solana
   * 开发：solana-devnet
   */
  chainId: string
}
export interface GenerateMessageResponse {
  code: number
  data: GenerateMessageData
  message: string
}

export interface GenerateMessageData {
  message: Message
}

export interface Message {
  address: string
  chainId: string
  domain: string
  expirationTime: string
  issuedAt: string
  nonce: string
  statement: string
  uri: string
  version: string
}

export async function generateMessage(
  request: GenerateMessageRequest
): Promise<Message | null> {
  try {
    const response = await fetchInstance.post<GenerateMessageResponse>(
      `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/siws/generate_message`,
      request
    )
    if (response.code === 200) {
      return response.data.message
    }
    return null
  } catch (error) {
    console.error('Failed to generate message:', error)
    return null
  }
}

//(siws)验证签名
export interface VerifySignatureRequest {
  address: string
  signature: string
}
export interface VerifySignatureResponse {
  code: number
  data: VerifySignatureData
  message: string
}

export interface VerifySignatureData {
  authToken: string
}

export async function verifySignature(
  request: VerifySignatureRequest
): Promise<VerifySignatureData | null> {
  try {
    const response = await fetchInstance.post<VerifySignatureResponse>(
      `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/siws/verify_signature`,
      request
    )
    if (response.code === 200) {
      return response.data
    }
    return null
  } catch (error) {
    console.error('Failed to get user info:', error)
    return null
  }
}

//获取siws用户资料

export interface GetUserInfoResponse {
  code: number
  data: GetUserInfoData
  message: string
}

export interface GetUserInfoData {
  address: string
  chain: string
  createdAt: string
  id: string
  transaction_limit: string
  transaction_total: string
  updatedAt: string
  /**
   * kyc状态，0 未验证
   * 1 验证中
   * 2 验证通过
   * 3 验证失败
   */
  verified: number
}

export async function getUserInfo(): Promise<GetUserInfoData | null> {
  try {
    const response = await fetchInstance.get<GetUserInfoResponse>(
      `${import.meta.env.VITE_UP_SERVICE_API_HOST}/api/siws/user`
    )
    if (response.code === 200) {
      return response.data
    }
    return null
  } catch (error) {
    console.error('Failed to get user info:', error)
    return null
  }
}
