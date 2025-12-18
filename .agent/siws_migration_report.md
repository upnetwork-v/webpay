# Sign In With Solana (SIWS) 迁移调查报告

## 📋 摘要

本报告旨在分析将 webpay 项目从现有的 **Google OAuth** 登录方式切换到 **Sign In With Solana (SIWS)** 的可行性、风险评估及影响范围。

---

## 📊 一、现有系统分析

### 1.1 当前登录流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Google OAuth 登录流程                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 用户点击    │────▶│ 跳转 Google     │────▶│ Google 认证     │     │
│  │ Login with  │     │ OAuth 页面      │     │ 返回 auth_token │     │
│  │ Google 按钮 │     │                 │     │                 │     │
│  └─────────────┘     └─────────────────┘     └────────┬────────┘     │
│                                                       │               │
│                                                       ▼               │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 保存到      │◀────│ 获取用户信息    │◀────│ 回调到 index    │     │
│  │ authStore   │     │ /api/google/user│     │ 页面处理 token  │     │
│  └─────────────┘     └─────────────────┘     └─────────────────┘     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### 关键文件及功能：

| 文件 | 功能描述 |
|------|----------|
| `src/components/GoogleLoginButton.tsx` | Google 登录按钮组件，构建 OAuth URL 并跳转 |
| `src/utils/google.ts` | 生成 Google OAuth2 URL |
| `src/routes/index.tsx` | 处理 Google OAuth 回调，从 URL 获取 `auth-token` |
| `src/stores/authStore.ts` | 认证状态管理，存储 `authToken`、`user`、`isAuthenticated` |
| `src/api/auth.ts` | 调用 `/api/google/user` 获取用户信息 |
| `src/types/auth.ts` | 用户类型定义，包含 `google_id`、`google_email` 等字段 |

### 1.2 当前钱包连接流程

```
┌──────────────────────────────────────────────────────────────────────┐
│                     钱包连接流程 (支付使用)                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 用户点击    │────▶│ 打开钱包选择器  │────▶│ 用户选择钱包    │     │
│  │ Connect     │     │ WalletSelector  │     │ (Phantom/OKX/   │     │
│  │ Wallet 按钮 │     │                 │     │  Trust)         │     │
│  └─────────────┘     └─────────────────┘     └────────┬────────┘     │
│                                                       │               │
│                                                       ▼               │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 保存连接    │◀────│ 处理连接回调    │◀────│ 钱包连接        │     │
│  │ 状态到      │     │ handleConnect   │     │ (deeplink/      │     │
│  │ WalletState │     │ Callback        │     │  WalletConnect) │     │
│  └─────────────┘     └─────────────────┘     └─────────────────┘     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### 钱包适配器：

| 钱包 | 适配器文件 | 连接方式 |
|------|-----------|----------|
| Phantom | `src/wallets/adapters/phantom/PhantomWalletAdapter.ts` | Deeplink + 加密回调 |
| OKX | `src/wallets/adapters/okx/OkxWalletAdapter.ts` | WalletConnect / Universal Provider |
| Trust Wallet | `src/wallets/adapters/trust/TrustWalletAdapter.ts` | Deeplink |

### 1.3 认证与授权分离

**当前架构特点**：
- **认证 (Authentication)**: 通过 Google OAuth 完成，获取用户身份
- **钱包连接 (Wallet Connection)**: 用于支付交易签名，与身份认证分离
- **授权 (Authorization)**: 基于 `authToken`，通过 HTTP Header `auth-token` 传递

---

## 📐 二、SIWS API 接口分析

### 2.1 已实现的接口 (`src/api/siws.ts`)

| 接口 | 端点 | 功能 | 参数 | 返回值 |
|------|------|------|------|--------|
| `generateMessage` | `/api/siws/generate_message` | 生成待签名消息 | `address`, `chainId` | `Message` 对象 |
| `verifySignature` | `/api/siws/verify_signature` | 验证签名获取 token | `address`, `signature` | `authToken` |
| `getUserInfo` | `/api/siws/user` | 获取用户信息 | `address` | `GetUserInfoData` |

### 2.2 SIWS Message 结构

```typescript
interface Message {
  address: string;      // 钱包地址
  chainId: string;      // "solana" 或 "solana-devnet"
  domain: string;       // 域名
  expirationTime: string; // 过期时间
  issuedAt: string;     // 签发时间
  nonce: string;        // 随机数
  statement: string;    // 签名声明
  uri: string;          // URI
  version: string;      // 版本
}
```

### 2.3 SIWS 用户信息

```typescript
interface GetUserInfoData {
  address: string;           // 钱包地址
  chain: string;             // 链标识
  createdAt: string;         // 创建时间
  id: string;                // 用户 ID
  transaction_limit: string; // 交易限额
  transaction_total: string; // 累计交易
  updatedAt: string;         // 更新时间
  verified: 0 | 1 | 2 | 3;   // KYC 状态
}
```

---

## ✅ 三、可行性分析

### 3.1 技术可行性 - ✅ 完全可行

| 评估维度 | 状态 | 说明 |
|----------|------|------|
| API 接口 | ✅ 已就绪 | SIWS 相关接口已在 `src/api/siws.ts` 中实现 |
| 钱包基础设施 | ✅ 已就绪 | `WalletProvider` 提供完整的钱包连接能力 |
| 签名能力 | ⚠️ 需扩展 | 需要在适配器中添加 `signMessage` 方法 |
| KYC 集成 | ✅ 兼容 | `getSumsubToken` 已使用 `/api/siws/kyc/sumsub_token` 端点 |

### 3.2 业务可行性 - ✅ 可行

| 评估维度 | 状态 | 说明 |
|----------|------|------|
| 用户体验 | ✅ 改善 | 一个钱包完成登录和支付，流程更简洁 |
| Web3 友好 | ✅ 提升 | 符合 Web3 去中心化理念 |
| 迁移影响 | ⚠️ 需评估 | 现有 Google 用户数据迁移策略待定 |

### 3.3 必要的技术改动

#### 3.3.1 钱包适配器扩展 - 添加 `signMessage` 方法

**当前状态**：
- `WalletAdapter` 接口只有 `signTransaction` 方法
- 不具备签名任意消息的能力

**需要实现**：

```typescript
// 在 WalletAdapter 接口中添加
interface WalletAdapter {
  // ... 现有方法
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}
```

各钱包实现方式：

| 钱包 | 实现方式 |
|------|----------|
| Phantom | Mobile: 使用 `signMessage` deeplink；Desktop: 使用 `window.solana.signMessage` |
| OKX | 使用 `OKXSolanaProvider.signMessage` |
| Trust Wallet | ⚠️ Trust Wallet SDK 可能不直接支持任意消息签名 |

---

## ⚠️ 四、风险评估

### 4.1 高风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **Trust Wallet 签名兼容性** | Trust Wallet 可能不支持 `signMessage` | 评估是否在 Trust Wallet 中禁用 SIWS，或使用替代方案 |
| **现有用户数据迁移** | Google 用户与钱包用户数据如何关联 | 需后端提供账户关联接口或并行支持两种登录 |
| **会话管理变化** | SIWS Token 与 Google Token 格式/有效期可能不同 | 统一 token 处理逻辑，确保 `authStore` 兼容 |

### 4.2 中等风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **Phantom Mobile 回调处理** | deeplink 回调可能与现有支付回调冲突 | 设计独立的登录回调处理流程 |
| **用户类型字段差异** | `User` 类型包含 `google_email` 等字段 | 扩展类型定义，使用联合类型或条件字段 |
| **网络切换 (Mainnet/Devnet)** | `chainId` 需与环境配置一致 | 通过环境变量统一配置 |

### 4.3 低风险项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **KYC 流程兼容** | KYC 已使用 SIWS 端点 | 无需修改 |
| **订单 API 调用** | 使用 `auth-token` Header | 只需确保 SIWS token 格式兼容 |

---

## 📌 五、影响范围分析

### 5.1 需要修改的文件

#### 核心修改 (高优先级)

| 文件 | 修改类型 | 具体内容 |
|------|----------|----------|
| `src/types/auth.ts` | 重构 | 扩展 `User` 类型支持 SIWS 用户字段 |
| `src/stores/authStore.ts` | 重构 | 适配 SIWS 登录流程，修改 `login` 方法 |
| `src/api/auth.ts` | 修改 | 切换到使用 SIWS `getUserInfo` |
| `src/routes/webpay/order_id/$orderId.tsx` | 重构 | 整合钱包连接与登录流程 |
| `src/wallets/types/wallet.ts` | 扩展 | 添加 `signMessage` 接口 |
| `src/wallets/adapters/*/` | 扩展 | 各适配器实现 `signMessage` |

#### 辅助修改 (中优先级)

| 文件 | 修改类型 | 具体内容 |
|------|----------|----------|
| `src/wallets/provider/WalletProvider.tsx` | 扩展 | 添加 SIWS 登录相关功能 |
| `src/routes/index.tsx` | 修改 | 移除/修改 Google OAuth 回调处理 |
| `src/components/GoogleLoginButton.tsx` | 删除/替换 | 替换为 SIWS 登录按钮 |
| `src/utils/google.ts` | 删除 | 不再需要 Google OAuth 工具函数 |

#### 可能受影响的文件 (低优先级)

| 文件 | 影响原因 |
|------|----------|
| `src/components/KYCStatus.tsx` | 用户字段可能变化 |
| `src/hooks/usePayment.ts` | 依赖 `publicKey` |
| `src/api/index.ts` | 可能需调整 401 处理逻辑 |

### 5.2 不需要修改的模块

| 模块 | 原因 |
|------|------|
| 订单 API (`src/api/order.ts`) | 使用通用 `auth-token` Header |
| KYC 模块 (`src/api/kyc.ts`, `src/stores/kycStore.ts`) | 已使用 SIWS 端点 |
| 支付交易逻辑 (`usePayment`, `handlePay`) | 与登录流程解耦 |
| 钱包支付回调处理 | 独立于登录回调 |

---

## 🎯 六、推荐实施策略

### 6.1 推荐方案：统一钱包登录与支付

```
┌──────────────────────────────────────────────────────────────────────┐
│                     新 SIWS 登录 + 支付流程                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  阶段一：钱包连接 + 登录                                               │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 用户点击    │────▶│ 选择钱包并连接  │────▶│ 生成 SIWS      │     │
│  │ Connect &   │     │ 获取 publicKey  │     │ message        │     │
│  │ Sign In     │     │                 │     │                 │     │
│  └─────────────┘     └─────────────────┘     └────────┬────────┘     │
│                                                       │               │
│                                                       ▼               │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 保存认证    │◀────│ 验证签名获取    │◀────│ 钱包签名       │     │
│  │ 状态和      │     │ authToken       │     │ message        │     │
│  │ 用户信息    │     │                 │     │                 │     │
│  └─────────────┘     └─────────────────┘     └─────────────────┘     │
│                                                                       │
│  阶段二：支付（使用同一钱包）                                          │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐     │
│  │ 用户点击    │────▶│ 创建交易       │────▶│ 钱包签名交易    │     │
│  │ Pay Now     │     │                 │     │                 │     │
│  └─────────────┘     └─────────────────┘     └────────┬────────┘     │
│                                                       │               │
│                                                       ▼               │
│                                              ┌─────────────────┐     │
│                                              │ 广播交易        │     │
│                                              │ 完成支付        │     │
│                                              └─────────────────┘     │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 实施阶段

| 阶段 | 内容 | 工期估算 |
|------|------|----------|
| **阶段 0: 准备** | 确认后端 API 完备性，设计类型定义 | 1-2 天 |
| **阶段 1: 适配器扩展** | 为 Phantom、OKX 添加 `signMessage` 能力 | 2-3 天 |
| **阶段 2: 核心流程实现** | 实现 SIWS 登录流程，修改 `authStore` | 3-4 天 |
| **阶段 3: UI 集成** | 修改支付页面，整合登录与钱包连接 | 2-3 天 |
| **阶段 4: 测试与优化** | 端到端测试，边界情况处理 | 2-3 天 |
| **阶段 5: 清理** | 移除 Google OAuth 相关代码 | 1 天 |

**总计估算**：**11-16 天**

---

## 📋 七、技术详细设计要点

### 7.1 新的 User 类型定义

```typescript
// src/types/auth.ts

// SIWS 用户类型
export interface SIWSUser {
  id: string;
  address: string;
  chain: string;
  createdAt: string;
  updatedAt: string;
  transaction_limit: string;
  transaction_total: string;
  verified: 0 | 1 | 2 | 3;
}

// 保持向后兼容的联合类型
export interface User extends SIWSUser {
  // 可选的遗留字段（用于迁移期）
  google_email?: string;
  google_id?: string;
  username?: string;
  badge?: number;
  inviteCode?: string;
  principal_id?: string;
  privilege?: boolean;
}
```

### 7.2 SIWS 登录流程伪代码

```typescript
async function signInWithSolana() {
  // 1. 确保钱包已连接
  if (!state.isConnected || !state.publicKey) {
    await openWalletSelector();
    return; // 等待连接回调后再继续
  }

  // 2. 获取待签名消息
  const chainId = import.meta.env.VITE_SOLANA_NETWORK; // "solana" or "solana-devnet"
  const message = await generateMessage({
    address: state.publicKey,
    chainId: chainId,
  });

  if (!message) {
    throw new Error("Failed to generate SIWS message");
  }

  // 3. 构建完整的 SIWS 消息字符串
  const messageString = formatSIWSMessage(message);
  const messageBytes = new TextEncoder().encode(messageString);

  // 4. 请求钱包签名
  const signature = await adapter.signMessage(messageBytes);
  const signatureBase58 = bs58.encode(signature);

  // 5. 验证签名并获取 token
  const authData = await verifySignature({
    address: state.publicKey,
    signature: signatureBase58,
  });

  if (!authData) {
    throw new Error("Signature verification failed");
  }

  // 6. 保存认证状态
  authStore.login(authData.authToken);

  // 7. 获取用户信息
  const userInfo = await getUserInfo({ address: state.publicKey });
  authStore.setUser(userInfo);
}
```

### 7.3 Phantom signMessage deeplink

```typescript
// src/wallets/adapters/phantom/PhantomWalletAdapter.ts

async signMessage(message: Uint8Array): Promise<Uint8Array> {
  // 检测是否在 Phantom 浏览器内
  if (window.solana?.isPhantom) {
    return await window.solana.signMessage(message);
  }

  // Mobile deeplink 方式
  const messageBase58 = bs58.encode(message);
  const redirectUrl = `${window.location.origin}/siws-callback`;

  const deeplink = buildUrl("signMessage", new URLSearchParams({
    message: messageBase58,
    session: this.session,
    redirect_link: redirectUrl,
  }));

  window.location.href = deeplink;
  throw new Error("PHANTOM_REDIRECT_PENDING");
}
```

---

## ✅ 八、结论与建议

### 8.1 结论

从技术角度来看，**SIWS 迁移完全可行**。核心 API 已就绪，钱包基础设施完备，主要工作集中在：
1. 扩展钱包适配器添加 `signMessage` 能力
2. 重构认证流程整合钱包连接与登录
3. 适配用户类型定义

### 8.2 建议

1. **优先验证 Trust Wallet 兼容性** - 如果不支持，需设计降级方案
2. **与后端确认** - 确保 SIWS `authToken` 与现有 API 兼容
3. **考虑过渡期策略** - 是否需要临时支持双登录方式
4. **设计账户迁移方案** - 现有 Google 用户如何迁移到 SIWS

---

## 📎 附录：关键代码文件清单

```
src/
├── api/
│   ├── siws.ts         ✅ 已就绪
│   ├── auth.ts         🔄 需修改
│   ├── kyc.ts          ✅ 无需修改
│   └── order.ts        ✅ 无需修改
├── components/
│   ├── GoogleLoginButton.tsx  ❌ 将删除/替换
│   └── KYCStatus.tsx          🔄 可能需微调
├── routes/
│   ├── index.tsx              🔄 需修改
│   └── webpay/order_id/$orderId.tsx  🔄 需重构
├── stores/
│   ├── authStore.ts           🔄 需重构
│   └── kycStore.ts            ✅ 无需修改
├── types/
│   ├── auth.ts                🔄 需扩展
│   └── payment.ts             ✅ 无需修改
├── utils/
│   └── google.ts              ❌ 将删除
└── wallets/
    ├── types/wallet.ts        🔄 需扩展
    ├── provider/WalletProvider.tsx  🔄 需扩展
    └── adapters/
        ├── phantom/           🔄 需添加 signMessage
        ├── okx/               🔄 需添加 signMessage
        └── trust/             ⚠️ 需评估兼容性
```

---

**报告日期**: 2025-12-18
**报告版本**: v1.0
**作者**: Gemini Code Agent
