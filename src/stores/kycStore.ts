import { getSumsubToken } from '@/api/kyc'
import type { KYCSDKConfig, KYCSDKOptions } from '@/types/kyc'
import { create } from 'zustand'

interface KYCState {
  isKYCLoading: boolean
  kycError: string | null
  isKYCVisible: boolean
  accessToken: string | null
  config: KYCSDKConfig | null
  options: KYCSDKOptions | null
  sdkLoading: boolean // SDK 初始化加载状态
}

interface KYCActions {
  launchKYC: () => Promise<void>
  closeKYC: () => void
  setKYCError: (error: string | null) => void
  handleTokenExpiration: () => Promise<string>
  handleKYCError: (error: any) => void
  setSdkLoading: (loading: boolean) => void
}

type KYCStore = KYCState & KYCActions

export const useKYCStore = create<KYCStore>((set) => ({
  // State
  isKYCLoading: false,
  kycError: null,
  isKYCVisible: false,
  accessToken: null,
  config: null,
  options: null,
  sdkLoading: true, // 默认为 true，等待 SDK 初始化

  // Actions
  launchKYC: async () => {
    try {
      console.log('🚀 Launching KYC...')
      set({ isKYCLoading: true, kycError: null })

      // 1. Get Sumsub token
      console.log('📡 Getting Sumsub token...')
      const tokenData = await getSumsubToken()
      console.log('✅ Token received:', tokenData)

      if (!tokenData) {
        throw new Error('Failed to get KYC token')
      }

      // 2. Prepare config and options
      const config: KYCSDKConfig = {
        lang: 'en',
        theme: 'dark',
      }

      const options: KYCSDKOptions = {
        addViewportTag: false,
        adaptIframeHeight: true,
      }

      // 3. Set token and show KYC
      console.log('🔑 Setting access token and showing KYC...')
      set({
        accessToken: tokenData.token,
        isKYCVisible: true,
        config,
        options,
        sdkLoading: true, // 重置 SDK 加载状态
      })
      console.log('✅ KYC should be visible now')
    } catch (error) {
      console.error('❌ KYC Launch Error:', error)
      set({
        kycError: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      set({ isKYCLoading: false })
    }
  },

  closeKYC: () => {
    console.log('🔒 Closing KYC')
    set({
      isKYCVisible: false,
      accessToken: null,
      kycError: null,
      config: null,
      options: null,
      sdkLoading: true, // 关闭时重置加载状态，为下次打开做准备
    })
  },

  setKYCError: (error: string | null) => {
    set({ kycError: error })
  },

  handleTokenExpiration: async () => {
    try {
      const tokenData = await getSumsubToken()
      return tokenData?.token || ''
    } catch (error) {
      console.error('Token refresh failed:', error)
      return ''
    }
  },

  handleKYCError: (error: any) => {
    console.error('KYC Error:', error)
    set({ kycError: 'KYC verification failed' })
  },

  setSdkLoading: (loading: boolean) => {
    set({ sdkLoading: loading })
  },
}))
