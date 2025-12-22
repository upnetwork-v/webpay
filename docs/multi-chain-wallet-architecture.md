# 多链钱包架构方案

> 文档创建日期: 2024-12-22
> 状态: 技术调研完成，待实施

## 1. 概述

### 1.1 背景

WebPay 项目目前使用 **Sign In With Solana (SIWS)** 方式实现登录和创建账户，仅支持 Solana 链交易。为了支持未来的 ETH 等 EVM 链交易需求，需要设计一个兼容多链的架构方案。

### 1.2 核心结论

**可以维持现有的 SIWS 登录方案不变**，通过扩展钱包适配层来支持：
- 多钱包兼容（Phantom、OKX、Binance）
- 多链交易（Solana + EVM 链）

### 1.3 设计原则

- **最小改动原则**：保持登录逻辑不变，仅扩展支付层
- **渐进式扩展**：按阶段实施，降低风险
- **用户体验优先**：利用钱包 App 原生多链能力，无需用户切换钱包

---

## 2. 架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    用户账户 (User Account)                           │
│                                                                      │
│    登录方式: Sign In With Solana (SIWS)                             │
│    账户标识: Solana 公钥地址                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    钱包适配层 (Wallet Adapter)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Phantom   │  │     OKX     │  │    Binance  │                  │
│  │   Wallet    │  │   Wallet    │  │   Web3 W3W  │                  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│         │                │                │                          │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐                  │
│  │Solana│ EVM  │  │Solana│ EVM  │  │Solana│ EVM  │                  │
│  └──────┴──────┘  └──────┴──────┘  └──────┴──────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
        ┌──────────────┐               ┌──────────────┐
        │ Solana 交易   │               │  EVM 交易    │
        │ USDC/SOL     │               │ USDC/ETH等   │
        └──────────────┘               └──────────────┘
```

### 2.2 登录流程（保持不变）

```
用户 → 选择钱包 → 连接钱包 (Solana) → SIWS 签名 → 后端验证 → 获取 authToken → 登录成功
```

### 2.3 支付流程（扩展支持多链）

```
订单 → 获取 PreferredRoute → 判断链类型
    ├─ Solana 链 → 使用 Solana Provider → signTransaction → 广播交易
    └─ EVM 链 → 使用 EVM Provider → eth_sendTransaction → 返回 txHash
```

---

## 3. 钱包兼容性分析

### 3.1 兼容性矩阵

| 钱包 | SIWS 登录 | Solana 交易 | EVM 交易 | 实现方式 |
|------|:---------:|:-----------:|:--------:|----------|
| **Phantom** | ✅ | ✅ | ✅ | `window.phantom.solana` / `window.phantom.ethereum` |
| **OKX** | ✅ | ✅ | ✅ | `OKXUniversalProvider` (单 session 多链) |
| **Binance** | ✅ | ✅ | ✅ | Wallet Standard + `window.binancew3w.ethereum` |

### 3.2 Phantom 钱包

**Solana 支持**：
- 原生支持 `signMessage` (SIWS 登录)
- 原生支持 `signTransaction` (Solana 交易)

**EVM 支持**：
- Phantom 现已支持 Ethereum、Polygon 等 EVM 链
- 通过 `window.phantom.ethereum` 访问 EVM provider
- 支持 `eth_sendTransaction`、`personal_sign` 等标准方法

**Provider 检测**：
```typescript
// Solana provider
const solanaProvider = window.phantom?.solana

// EVM provider
const evmProvider = window.phantom?.ethereum
```

### 3.3 OKX 钱包

**技术特点**：
- 使用 `@okxconnect/universal-provider` 统一管理
- **单个 session 可同时请求多链授权**
- 支持 Solana、Ethereum、Polygon、BSC 等

**SDK 包**：
```bash
npm install @okxconnect/universal-provider @okxconnect/solana-provider
```

**多链连接示例**：
```typescript
import { OKXUniversalProvider } from '@okxconnect/universal-provider'
import { OKXSolanaProvider } from '@okxconnect/solana-provider'

const universalProvider = await OKXUniversalProvider.init({
  dappMetaData: { name: 'WebPay', icon: '...' }
})

// 同时请求 Solana 和 EVM 授权
const session = await universalProvider.connect({
  namespaces: {
    solana: {
      chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],  // mainnet
    },
    eip155: {
      chains: ['eip155:1', 'eip155:137'],  // Ethereum + Polygon
    },
  },
})

// Solana provider
const solanaProvider = new OKXSolanaProvider(universalProvider)

// EVM 交易
const txHash = await universalProvider.request({
  method: 'eth_sendTransaction',
  params: [txParams],
}, 'eip155:1')
```

**官方文档**：
- [OKX Connect Documentation](https://www.okx.com/web3/build/docs/sdks/app-connect-overview)

### 3.4 Binance Web3 Wallet

**Solana 支持**：
- 内置 **Wallet Standard** 支持
- 无需额外 SDK，通过标准 Solana Wallet Adapter 自动检测
- 在币安 App 内置浏览器中自动注入 provider

**EVM 支持**：
- 通过 `window.binancew3w.ethereum` 访问
- 支持标准 EIP-1193 方法

**SDK 包**：
```bash
npm install @binance/w3w-utils
```

**代码示例**：
```typescript
import { isInBinance, getDeeplink } from '@binance/w3w-utils'

// 检测是否在币安 App 内
if (isInBinance() || window.binancew3w?.ethereum) {
  // EVM 连接
  const accounts = await window.binancew3w.ethereum.request({
    method: 'eth_requestAccounts'
  })

  // EVM 交易
  const txHash = await window.binancew3w.ethereum.request({
    method: 'eth_sendTransaction',
    params: [txParams],
  })
}

// 生成 deeplink（外部浏览器引导打开币安 App）
const deeplink = getDeeplink(url, chainId)
```

**官方文档**：
- [Binance Wallet SDK](https://developers.binance.com/docs/zh-CN/binance-w3w/introduction)
- [EVM-Compatible Provider](https://developers.binance.com/docs/zh-CN/binance-w3w/evm-compatible-provider)
- [Solana Provider](https://developers.binance.com/docs/zh-CN/binance-w3w/solana-provider)

---

## 4. 实施方案

### 4.1 阶段划分

| 阶段 | 内容 | 预估工作量 | 优先级 |
|------|------|-----------|--------|
| Phase 1 | 现状维护（SIWS + Solana 支付） | 已完成 | - |
| Phase 2 | 扩展 OKX 适配器支持多链 | 2-3 天 | 高 |
| Phase 3 | 添加 Binance 钱包支持 | 1-2 天 | 中 |
| Phase 4 | 扩展 Phantom EVM 支持 | 1 天 | 中 |
| Phase 5 | 支付层多链分发逻辑 | 2 天 | 高 |

### 4.2 Phase 2: OKX 多链扩展

**修改文件**: `src/wallets/adapters/okx/OkxWalletAdapter.ts`

```typescript
// 新增 EVM chain IDs
const OKX_SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const OKX_ETH_CHAIN_ID = 'eip155:1'
const OKX_POLYGON_CHAIN_ID = 'eip155:137'

export class OkxWalletAdapter implements WalletAdapter {
  // 新增 EVM 地址
  private evmAddress: string | null = null

  async connect(): Promise<void> {
    // 同时请求 Solana 和 EVM 授权
    const session = await this.universalProvider.connect({
      namespaces: {
        solana: { chains: [OKX_SOLANA_CHAIN_ID] },
        eip155: { chains: [OKX_ETH_CHAIN_ID, OKX_POLYGON_CHAIN_ID] },
      },
    })

    // 获取 EVM 地址
    const evmAccounts = session?.namespaces?.eip155?.accounts || []
    this.evmAddress = evmAccounts[0]?.split(':')[2] || null
  }

  // 新增 EVM 交易方法
  async sendEVMTransaction(params: {
    chainId: number
    to: string
    value?: string
    data?: string
  }): Promise<string> {
    const chain = `eip155:${params.chainId}`
    return this.universalProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: this.evmAddress,
        to: params.to,
        value: params.value || '0x0',
        data: params.data || '0x',
      }],
    }, chain)
  }

  getEVMAddress(): string | null {
    return this.evmAddress
  }
}
```

### 4.3 Phase 5: 支付层多链分发

**修改文件**: `src/hooks/usePayment.ts`

```typescript
export const usePayment = (props: UsePaymentProps) => {
  const createPaymentTransaction = useCallback(async () => {
    const { order, PreferredRoute, payTokenAmount } = props
    const chainName = PreferredRoute?.chainName?.toLowerCase()

    // Solana 链支付 (现有逻辑)
    if (chainName === 'solana') {
      return {
        type: 'solana' as const,
        transaction: await createSolanaTransaction(...),
      }
    }

    // EVM 链支付 (新增)
    if (['ethereum', 'polygon', 'bsc'].includes(chainName)) {
      return {
        type: 'evm' as const,
        chainId: getChainId(chainName),
        to: PreferredRoute.isNative ? PreferredRoute.payToAddress : PreferredRoute.tokenAddress,
        value: PreferredRoute.isNative ? toHex(payTokenAmount) : '0x0',
        data: PreferredRoute.isNative ? '0x' : encodeERC20Transfer(PreferredRoute.payToAddress, payTokenAmount),
      }
    }

    throw new Error(`Unsupported chain: ${chainName}`)
  }, [props])

  return { createPaymentTransaction, ... }
}

// 辅助函数
function getChainId(chainName: string): number {
  const chainIds: Record<string, number> = {
    ethereum: 1,
    polygon: 137,
    bsc: 56,
  }
  return chainIds[chainName] || 1
}

function encodeERC20Transfer(to: string, amount: number): string {
  // transfer(address,uint256) selector
  const selector = '0xa9059cbb'
  const paddedTo = to.slice(2).padStart(64, '0')
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0')
  return selector + paddedTo + paddedAmount
}
```

---

## 5. 类型定义扩展

### 5.1 钱包类型

```typescript
// src/wallets/types/wallet.ts

export type ChainType = 'solana' | 'ethereum' | 'polygon' | 'bsc'

export interface PaymentTransaction {
  type: 'solana' | 'evm'
  // Solana
  transaction?: Transaction
  // EVM
  chainId?: number
  to?: string
  value?: string
  data?: string
}

export interface WalletAdapter {
  // 现有方法
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  signTransaction: (transaction: Transaction) => Promise<Transaction>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>

  // 新增 EVM 方法 (可选)
  sendEVMTransaction?: (params: EVMTxParams) => Promise<string>
  getEVMAddress?: () => string | null

  // 能力声明
  capabilities: WalletCapabilities & {
    supportsEVM?: boolean
  }
}

export interface EVMTxParams {
  chainId: number
  to: string
  value?: string
  data?: string
}
```

---

## 6. 环境检测工具

```typescript
// src/wallets/utils/environment.ts

export interface WalletEnvironment {
  wallet: 'phantom' | 'okx' | 'binance' | 'unknown'
  solanaProvider: SolanaProvider | null
  evmProvider: EVMProvider | null
}

export function detectWalletEnvironment(): WalletEnvironment {
  // Binance App 内
  if (window.binancew3w?.ethereum) {
    return {
      wallet: 'binance',
      solanaProvider: window.solana,
      evmProvider: window.binancew3w.ethereum,
    }
  }

  // Phantom (包括 App 内和 Extension)
  if (window.phantom?.solana) {
    return {
      wallet: 'phantom',
      solanaProvider: window.phantom.solana,
      evmProvider: window.phantom?.ethereum || null,
    }
  }

  // OKX 需要通过 adapter 实例获取
  // 此处返回 unknown，由 adapter 层处理

  return {
    wallet: 'unknown',
    solanaProvider: window.solana || null,
    evmProvider: window.ethereum || null,
  }
}

export function isInBinanceApp(): boolean {
  return !!(window.binancew3w?.ethereum || window.ethereum?.isBinance)
}
```

---

## 7. 测试计划

### 7.1 测试矩阵

| 场景 | Phantom | OKX | Binance |
|------|:-------:|:---:|:-------:|
| SIWS 登录 | ✓ | ✓ | ✓ |
| Solana USDC 支付 | ✓ | ✓ | ✓ |
| Solana SOL 支付 | ✓ | ✓ | ✓ |
| ETH USDC 支付 | ✓ | ✓ | ✓ |
| ETH 原生支付 | ✓ | ✓ | ✓ |
| Polygon 支付 | ✓ | ✓ | ✓ |

### 7.2 测试环境

- Solana: Devnet / Mainnet
- Ethereum: Sepolia / Mainnet
- Polygon: Mumbai / Mainnet

---

## 8. 风险与注意事项

### 8.1 潜在风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 钱包 API 变更 | 功能失效 | 定期检查官方文档，做好版本锁定 |
| 多链 session 失效 | 需重新授权 | 实现 session 恢复逻辑 |
| EVM 链网络切换 | 交易失败 | 在发送前检查当前链 ID |
| 用户拒绝授权 | 流程中断 | 提供清晰的错误提示 |

### 8.2 注意事项

1. **后端配合**：订单的 `PreferredRoute` 需要能返回 EVM 链信息
2. **Gas 估算**：EVM 交易需要估算 gas，可使用 `eth_estimateGas`
3. **代币精度**：不同链的 USDC 精度可能不同（Solana 6位，EVM 6位）
4. **交易确认**：EVM 链确认时间与 Solana 不同，需调整轮询策略

---

## 9. 参考文档

- [Phantom Developer Docs](https://docs.phantom.app/)
- [OKX Connect Documentation](https://www.okx.com/web3/build/docs/sdks/app-connect-overview)
- [Binance Wallet SDK](https://developers.binance.com/docs/zh-CN/binance-w3w/introduction)
- [EIP-1193: Ethereum Provider JavaScript API](https://eips.ethereum.org/EIPS/eip-1193)
- [Solana Wallet Standard](https://github.com/wallet-standard/wallet-standard)
- [Sign In With Ethereum (SIWE)](https://login.xyz/)

---

## 10. 变更日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2024-12-22 | 1.0 | 初始版本，技术调研完成 |
