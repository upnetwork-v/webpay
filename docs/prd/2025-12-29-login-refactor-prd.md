# PRD: Webpay 登录方式重构与 KYC 逻辑统一

| 属性     | 值                        |
| -------- | ------------------------- |
| 版本     | 1.0                       |
| 状态     | 草稿                      |
| 创建日期 | 2025-12-29                |
| 作者     | Antigravity               |
| 需求类型 | 全栈                      |
| 复杂度   | 中等                      |

---

## 1. 概述

### 1.1 背景
当前 `webpay` 项目使用 Google OAuth 进行用户登录，而移动端产品 `upnetwork-v2` 使用基于 ICP (Internet Computer) 和 WebAuthn (Passkeys) 的去中心化身份体系。为了统一生态内的用户账户体系，实现 "One Account, Any Device" 的愿景，需要将 `webpay` 的登录方式重构为与移动端一致。

### 1.2 问题描述
1. **账户割裂**：Web 端和 App 端目前是两套独立的账户系统，数据无法互通。
2. **中心化依赖**：`webpay` 依赖 Google 服务，不符合产品去中心化的长期规划。
3. **维护成本**：维护两套鉴权与 KYC 接口逻辑增加了后端与前端的维护成本。

### 1.3 解决方案概述
1. **废弃 Google 登录**：移除 Google OAuth 相关代码。
2. **引入 Passkey 登录**：在 Web 端实现基于 ICP Canister 的 WebAuthn 注册与登录流程，逻辑与 `upnetwork-v2` 保持一致。
3. **统一 KYC 鉴权**：将 KYC 令牌获取接口从 `/api/google/kyc/sumsub_token` 迁移至 `/api/kyc/sumsub_token`，使用 ICP 身份签名的 `auth-token` 进行鉴权。

---

## 2. 目标与指标

### 2.1 目标

| 编号 | 目标     | 优先级   |
| ---- | -------- | -------- |
| G1   | `webpay` 支持使用 Passkey (TouchID/FaceID) 注册新账户 | 必须实现 |
| G2   | `webpay` 支持使用 Passkey 登录已有 `upnetwork-v2` 账户（需 Passkey 同步或重新添加设备） | 必须实现 |
| G3   | 登录后获得的身份凭证 (Identity) 能正确调用后端受保护接口 (如 KYC) | 必须实现 |
| G4   | 移除所有 Google 登录相关依赖 | 必须实现 |

### 2.2 非目标
- 本次不涉及后端 Canister 代码的修改（复用现有接口）。
- 本次暂不处理跨浏览器/跨生态的 Passkey 漫游复杂场景（依赖系统自带的 iCloud Keychain/Google Password Manager 同步）。
- 不涉及现有 Google 登录用户的数据迁移（已确认无需迁移）。

### 2.3 成功标准

| 标准     | 描述   | 验证方式 |
| -------- | ------ | -------- |
| 注册成功率 | 用户能顺利通过系统生物识别完成注册 | 在主流浏览器 (Chrome/Safari) 测试通过 |
| 登录互通性 | 同一 iCloud 账号下的 Mac 和 iPhone 可互通登录 | 验证移动端创建的账号可在 Web 端登录 |
| KYC 流程通畅 | 登录后能正常调起 Sumsub SDK 且状态同步正确 | 跑通完整的 KYC 验证流程 |
| 订单页适配 | 未登录用户在订单页能直接通过 Passkey 登录并支付 | 验证扫描二维码后的支付流程 |

---

## 3. 用户分析

### 3.1 目标用户

| 用户类型 | 特征   | 核心需求 |
| -------- | ------ | -------- |
| 新用户 | 首次访问 Webpay | 快速创建钱包/账户，无需记忆密码 |
| 存量 App 用户 | 已有 App 账号，希望在 Web 端支付 | 使用 App 账号直接登录，同步 KYC 状态和交易记录 |
| 扫码支付用户 | 通过二维码访问订单页 | 快速登录/注册后完成支付，流程不中断 |

### 3.2 用户旅程

1. **入口**：
   - 场景 A：用户访问 `webpay` 首页或点击 "Login"。
   - 场景 B：用户扫描支付二维码或点击链接进入 `webpay/order_id/$orderId` 页面。
2. **操作**：
   - 注册：点击 "Create Account" -> 输入用户名 -> 唤起浏览器 Passkey 提示 -> 验证指纹/面容 -> 注册成功。
   - 登录：点击 "Login" -> 输入用户名 (可选) -> 唤起浏览器 Passkey 提示 -> 验证指纹/面容 -> 登录成功。
3. **结果**：
   - 场景 A：进入 Wallet 页面，显示余额和 KYC 状态。
   - 场景 B：保持在当前订单页，状态变更为已登录，显示支付按钮和 KYC 状态，用户可继续支付。

---

## 4. 用户故事

### US-1: Passkey 注册

**作为** 新用户
**我想要** 使用设备自带的生物识别（指纹/人脸）创建账户
**以便** 无需记忆复杂密码，且账户由我自己掌握（去中心化）

**验收标准：**
- [ ] 输入用户名后，系统检查用户名可用性
- [ ] 能够唤起系统原生的创建 Passkey 弹窗
- [ ] 注册成功后自动登录并跳转至 Wallet 页面
- [ ] 注册过程中的错误（如取消、超时）有友好提示

### US-2: Passkey 登录

**作为** 已注册用户
**我想要** 使用生物识别快速登录
**以便** 访问我的资产和进行支付

**验收标准：**
- [ ] 点击登录能唤起系统原生的获取 Passkey 弹窗
- [ ] 验证通过后，前端成功获取 Delegation Identity
- [ ] 登录态在页面刷新后依然保持（持久化存储）

### US-3: KYC 鉴权迁移

**作为** 登录用户
**我想要** 进行 KYC 认证
**以便** 解锁交易额度

**验收标准：**
- [ ] `getSumsubToken` 接口请求头包含正确的 `auth-token`
- [ ] 后端正确验证签名并返回 Sumsub Token
- [ ] UI 展示逻辑（倒计时、轮播提示）保持与现状一致

---

## 5. 功能需求

### F1: 身份通信层 (Identity Layer)

- **描述**：移植 `upnetwork-v2` 的 `AnonymousActor` 和 `IdentityActor` 逻辑。
- **输入**：`canisterId`, `idlFactory` (复用移动端配置)。
- **输出**：可用于调用的 Actor 实例。
- **技术点**：使用 `@dfinity/agent` Web 端 SDK。

### F2: 注册流程 (Registration)

- **接口链**：
  1. `actor.start_register` (获取 Challenge)
  2. `navigator.credentials.create` (WebAuthn 签名)
  3. `actor.finish_register` (提交公钥)
- **前端逻辑**：需要将 RN 的 `react-native-passkey` 替换为 Web 原生 API。

### F3: 登录流程 (Login & Delegation)

- **接口链**：
  1. `actor.prepare_login` (获取 Challenge)
  2. `navigator.credentials.get` (WebAuthn 签名)
  3. 生成本地 Session Key (Ed25519)
  4. `actor.login` (提交 Session Key 公钥和 Passkey 签名)
  5. `actor.get_delegation` (获取带签名的委托书)
- **存储**：将 Identity 和 Delegation Chain 存储在 `localStorage` 或 `IndexedDB` 中。

### F4: KYC 逻辑统一

- **变更点**：
  - URL: `/api/google/kyc/sumsub_token` -> `/api/kyc/sumsub_token`
  - Headers: `auth-token: <ICP-Auth-Token>` (详见 7.3 节)
- **保持点**：
  - 复用现有的 `KYCModal` 组件和交互体验。
- **auth-token 获取流程**（参考 `upnetwork-v2`）：
  1. 通过 Canister 的 `sign_principal()` 方法获取签名
  2. 调用后端 `/api/auth/verify_principal` 验证签名并获取 `authToken`
  3. 将 `authToken` 作为请求头传递给 KYC 等受保护接口

### F5: 订单页适配 (Order Page Adaptation)

- **页面**: `src/routes/webpay/order_id/$orderId.tsx`
- **变更点**:
  - 替换 `<GoogleLoginButton />` 为新的 Passkey 登录组件/按钮。
  - 确保登录成功后，页面状态 (`isAuthenticated`) 自动更新，无需刷新即可展示支付按钮。
  - 确保 `KYCStatus` 组件能正确获取新 Token 下的用户 KYC 状态。
- **交互流程**:
  1. 未登录用户进入订单页，看到 "Login to Pay" (或其他文案) 按钮。
  2. 点击登录，弹出 Passkey 验证。
  3. 验证成功，按钮变为 "Pay Now" / "Connect Wallet"。

---

## 6. UI 交互规范

### 6.1 登录页改造

- **移除**：Google Login 按钮。
- **新增**：
  - "Login with Passkey" 主按钮。
  - "Create Account" 文字/次级按钮。
  - 输入框（如果非自动发现）：用于输入用户名。
- **状态反馈**：
  - 点击按钮后显示 Loading 状态。
  - 浏览器原生弹窗弹出时，UI 保持遮罩或提示 "请在浏览器弹窗中完成验证"。

### 6.2 错误处理

| 错误场景 | 提示文案 |
| -------- | -------- |
| 用户取消 Passkey | "已取消验证，请重试" |
| 设备不支持 | "当前设备不支持 Passkey，请尝试其他设备" |
| 用户名已存在 | "该用户名已被注册" |
| 网络/后端错误 | "服务连接失败，请稍后重试" |

---

## 7. API 规范 (ICP Canister)

**注意**：本部分直接复用 `upnetwork-v2` 的 IDL 定义，无需新开发后端接口。

### 7.1 Canister 接口

- `start_register_username(username, passkey_name, server_sig, display_name)`
- `finish_register_username(result_json)`
- `siwp_prepare_login_username(username)`
- `login(login_result_json, session_key, ...)`
- `siwp_get_delegation(username, session_key, expiration)`

### 7.2 后端 API (NodeJS/Gateway)

#### `POST /api/kyc/sumsub_token`

- **当前状态**: ✅ 已上线且正常运行（复用 `upnetwork-v2` 后端）
- **认证**：Required (Header: `auth-token`)
- **Headers**:
  ```json
  {
    "Content-Type": "application/json",
    "auth-token": "<authToken>"  // 由步骤 7.3 获得
  }
  ```
- **Response**:
  ```json
  {
    "code": "200",
    "data": {
      "token": "sbx:...",
      "userId": "..."
    }
  }
  ```
- **Error Codes**:
  - `401`: auth-token 无效或已过期
  - `500`: 服务器内部错误

### 7.3 auth-token 获取流程

**核心流程**（参考 `upnetwork-v2/src/hooks/useAuthProvider.tsx`）：

```typescript
// 1. 调用 Canister 的 sign_principal() 获取签名
const {message, signature} = await actor.sign_principal()

// 2. 调用后端验证接口
const response = await fetch('https://up-service.onta.network/api/auth/verify_principal', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({message, signature})
})

const {authToken} = await response.json()
// authToken 即为最终的鉴权令牌
```

**auth-token 特性**:
- **生成方式**: Canister 对当前 Principal 签名，后端验证后返回
- **有效期**: 24 小时（参考 `useAuthProvider.tsx` line 148）
- **存储方式**: 内存 + localStorage（需处理过期逻辑）
- **使用方式**: 作为 HTTP Header `auth-token: <value>` 传递

**完整示例**:
```typescript
// Step 1: 获取签名
const getAuthToken = async () => {
  // 调用 Canister
  const {message, signature} = await identityActor.sign_principal()

  // 验证并获取 token
  const response = await fetch(
    'https://up-service.onta.network/api/auth/verify_principal',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message, signature})
    }
  )

  if (response.status === 200) {
    const {authToken} = await response.json()
    return authToken
  }
  throw new Error('Failed to get auth token')
}

// Step 2: 使用 token 调用 KYC 接口
const authToken = await getAuthToken()
const kycResponse = await fetch(
  'https://up-service.onta.network/api/kyc/sumsub_token',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'auth-token': authToken
    }
  }
)
```

---

## 8. 依赖与集成

### 8.1 外部依赖
- **ICP Canister**: 必须确保 `webpay` 能访问到与 App 相同的 Canister 环境 (Mainnet)。
- **Sumsub**: 复用现有的 Sumsub 配置。
- **后端 API**: `https://up-service.onta.network` (已确认上线且运行正常)。

### 8.2 技术依赖
- **库迁移**：
  - 新增：`@dfinity/agent`, `@dfinity/candid`, `@dfinity/identity`, `@dfinity/principal`.
  - 能够复用 `upnetwork-v2` 的 `src/libs/icp` 目录下的生成代码。

### 8.3 复用资源清单

更多细节详见 [resources-list.md](./resources-list.md)。

#### Canister 配置
| 环境 | Canister Name | Canister ID | Host Url |
| :--- | :--- | :--- | :--- |
| **Prod (Mainnet)** | `swifty_wallet_backend` | `aiw2p-tyaaa-aaaam-aebyq-cai` | `https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io` |

#### 后端 API
| 服务名称 | Host URL | 关键端点 |
| :--- | :--- | :--- |
| **NodeJS Backend** | `https://up-service.onta.network` | `/api/auth/verify_principal`, `/api/kyc/sumsub_token` |

#### 域名配置
| 环境 | 域名 | RP ID | 用途 |
| :--- | :--- | :--- | :--- |
| **开发/测试** | `https://dev-web-wallet.onta.network` | `dev-web-wallet.onta.network` | 开发和测试共用 |
| **生产** | TBD（后续可能变更） | TBD | 正式环境（域名待定） |

**注意事项**:
- RP ID 必须与域名匹配，否则 Passkey 无法跨设备同步
- 开发和测试共用一套环境，切换环境需重新注册 Passkey
- 生产环境域名后续可能变更，需提前规划 Passkey 迁移方案

#### 关键代码文件 (需复制/参考)
- **IDL**: `upnetwork-v2/src/libs/icp/service.ts`
- **Actor Factory**: `upnetwork-v2/src/libs/icp/index.ts`
- **Identity 管理**: `upnetwork-v2/src/hooks/useIdentity.ts`, `upnetwork-v2/src/hooks/useSIWPIdentity/`
- **Auth 流程**: `upnetwork-v2/src/hooks/useAuthProvider.tsx`
- **Images**: `login-bg.png`, `OntapayLogo.png`, `kyc.png`

---

## 9. 技术可行性

### 9.1 WebAuthn 兼容性
- 现代浏览器（Chrome, Safari, Edge, Firefox）均原生支持 `navigator.credentials` API。
- 不需要引入额外的 Polyfill，但需要处理不同浏览器的 API 差异（主要是返回值格式的细微差别，通常由 helper 库或手动适配处理）。

### 9.2 跨端同步
- **Apple 生态**：iCloud Keychain 可自动同步 Passkey。App (React Native) 和 Web (Safari/Chrome on Mac) 只要登录同一个 iCloud，即可共享 Passkey。
- **Google 生态**：Android App 和 Chrome 登录同一个 Google 账号可同步。
- **多 Passkey 支持**：✅ **已确认 Canister 支持一个用户创建多个 Passkey**（参考 `upnetwork-v2` 实现）。
  - 用户可在不同设备上为同一账户注册多个 Passkey
  - 每个 Passkey 有独立的 `passkeyName`（设备标识）
  - 登录时可使用任意已注册的 Passkey
- **跨平台**：用户可通过以下方式在新设备登录：
  1. **系统同步**：使用 iCloud/Google 自动同步（推荐）
  2. **添加新设备**：在新设备上使用用户名触发 Passkey 注册，添加新的设备 Passkey
  3. **跨设备验证**：使用二维码扫描方式，通过已登录设备授权新设备

---

## 10. 验收检查清单

### 10.1 功能检查
- [ ] 能够成功注册一个新用户，并在 Canister 中查询到。
- [ ] 能够使用注册好的账号登录。
- [ ] 登录后 `localStorage` 中有缓存的 Identity 信息。
- [ ] 页面刷新后自动恢复登录态。

### 10.2 集成检查
- [ ] KYC 页面能正确加载，没有 401/403 错误。
- [ ] 完成 KYC 后，用户状态能变更（后端回调）。

### 10.3 兼容性检查
- [ ] macOS + Chrome 测试通过。
- [ ] macOS + Safari 测试通过。
- [ ] iOS + Safari 测试通过。

### 10.4 订单流程检查
- [ ] 确保在订单页未登录时显示 Passkey 登录选项。
- [ ] 登录后能正确展示订单详情、支付按钮和 KYC 状态。
- [ ] 支付流程不受鉴权方式变更的影响。

---

## 11. 风险评估

| 风险 | 可能性 | 影响 | 应对措施 |
| ---- | ------ | ---- | -------- |
| 跨设备/跨浏览器无法登录 | 中 | 高 | ✅ Canister 已支持多 Passkey。引导用户使用 iCloud/Google 同步，或在新设备上添加 Passkey。 |
| 域名变化导致 Passkey 失效 | 中 | 高 | ⚠️ 当前使用 `dev-web-wallet.onta.network`，已明确后续可能变更。需提前规划：<br>1. 尽量保持 RP ID 为顶级域名（如 `onta.network`）<br>2. 域名变更时提供旧设备迁移指引 |
| WebAuthn 浏览器兼容性 | 低 | 中 | 主流浏览器均支持，重点测试 Safari/Chrome。Firefox 部分版本需特殊处理。 |
| auth-token 过期处理 | 中 | 中 | 实现自动续期逻辑（24小时过期），过期后自动调用 `sign_principal` 重新获取。 |

---

## 12. 附录

### 12.1 术语表
- **ICP**: Internet Computer Protocol
- **Canister**: ICP 上的智能合约单元
- **II (Internet Identity)**: ICP 官方身份，本项目使用的是自定义的 SIWP (Sign-In with Passkey) 方案。
- **Delegation**: 委托模式，一种临时授权机制。
- **Session Key**: 本地生成的 Ed25519 密钥对，用于创建 Delegation Identity。
- **auth-token**: 后端签发的鉴权令牌，通过 Principal 签名验证获得，有效期 24 小时。
- **RP ID (Relying Party ID)**: WebAuthn 中的域名标识，Passkey 绑定到特定 RP ID。

### 12.2 数据模型变更

#### `useAuthStore` 调整

**现有字段**:
```typescript
interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
}
```

**新增字段**:
```typescript
interface AuthState {
  // ... 现有字段

  // ICP Identity 相关
  identity: DelegationIdentity | null      // ICP Delegation Identity
  identityId: string | null                // 用户名 (username)
  delegationChain: DelegationChain | null  // Delegation 链
  sessionIdentity: Ed25519KeyIdentity | null // Session Key
  principalId: string | null               // ICP Principal ID

  // Auth Token 相关
  authToken: string | null                 // 后端鉴权令牌
  authTokenExpiry: number | null           // Token 过期时间戳

  // Actor
  anonymousActor: ActorSubclass<_SERVICE> | null  // 匿名 Actor (登录前)
  identityActor: ActorSubclass<_SERVICE> | null   // 身份 Actor (登录后)
}
```

**新增方法**:
```typescript
interface AuthActions {
  // 登录/注册
  registerWithPasskey: (username: string) => Promise<void>
  loginWithPasskey: (username?: string) => Promise<void>
  logout: () => void

  // Token 管理
  refreshAuthToken: () => Promise<string>
  getAuthToken: () => Promise<string>  // 自动处理过期续期
}
```

#### Identity 存储格式

参考 `upnetwork-v2/src/hooks/useIdentity.ts`：

```typescript
interface SiwpIdentityStorage {
  uid: string                          // 用户名
  sessionIdentity: JsonnableEd25519KeyIdentity  // Session Key (可序列化格式)
  delegationChain: JsonnableDelegationChain    // Delegation Chain (可序列化格式)
}

// 存储到 localStorage
const data = JSON.stringify({
  uid: username,
  sessionIdentity: sessionIdentity.toJSON(),
  delegationChain: delegationChain.toJSON()
})
localStorage.setItem('siwp_identity', data)

// 从 localStorage 恢复
const stored = localStorage.getItem('siwp_identity')
if (stored) {
  const parsed: SiwpIdentityStorage = JSON.parse(stored)
  const delegationChain = DelegationChain.fromJSON(parsed.delegationChain)
  const sessionIdentity = Ed25519KeyIdentity.fromJSON(
    typeof parsed.sessionIdentity === 'object'
      ? JSON.stringify(parsed.sessionIdentity)
      : parsed.sessionIdentity
  )
  const identity = DelegationIdentity.fromDelegation(sessionIdentity, delegationChain)
}
```

### 12.3 WebAuthn 技术参考

#### 推荐工具库
- **`@github/webauthn-json`**: 处理 WebAuthn API 的 ArrayBuffer ↔ JSON 转换
- **优势**: 自动处理 Base64URL 编码，简化类型转换

```typescript
import { create, get } from '@github/webauthn-json'

// 注册
const credential = await create({ publicKey: options })
const credentialJSON = JSON.stringify(credential)

// 登录
const assertion = await get({ publicKey: options })
const assertionJSON = JSON.stringify(assertion)
```

#### 手动转换示例

如果不使用工具库，需手动处理 ArrayBuffer 转换：

```typescript
// ArrayBuffer -> Base64URL
function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Base64URL -> ArrayBuffer
function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
```

#### 浏览器兼容性

| 浏览器 | 最低版本 | 注意事项 |
|--------|---------|----------|
| Chrome | 67+ | 完全支持，推荐用于开发 |
| Safari | 13+ | 完全支持，Apple 生态必备 |
| Firefox | 60+ | 支持，但部分版本对跨域 Passkey 支持有限 |
| Edge | 18+ | 基于 Chromium，与 Chrome 一致 |

**降级方案**:
```typescript
if (!window.PublicKeyCredential) {
  // 浏览器不支持 WebAuthn
  alert('当前浏览器不支持 Passkey，请使用 Chrome/Safari/Edge 最新版本')
  return
}
```

