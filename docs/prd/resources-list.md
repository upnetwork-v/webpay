# Webpay 登录方式重构：复用资源清单

为确保 `webpay` 项目的登录重构能够顺利对接现有的 `upnetwork-v2` 生态，以下是从原项目 (`upnetwork-v2`) 调研整理出的复用资源清单。开发过程中请严格参考或直接复制这些资源。

## 1. 核心 Canister 资源

这些 Canister 是后端服务的核心，负责身份验证、注册和委托逻辑。

| 环境 | Canister Name | Canister ID | Host Url | 备注 |
| :--- | :--- | :--- | :--- | :--- |
| **Prod (Mainnet)** | `swifty_wallet_backend` | `aiw2p-tyaaa-aaaam-aebyq-cai` | `https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io` | 生产环境 ID，**必须使用** |
| Bridge | `vusd_bridge` | `bd2ii-6iaaa-aaaan-q2g3q-cai` | - | 用于 VUSD 跨链桥（如果涉及） |

> **数据来源**: `upnetwork-v2/.env`

## 2. 接口定义 (IDL & Types)

`webpay` 需要与上述 Canister 通信，必须引入相同的 Candid 接口定义。

*   **源目录**: `upnetwork-v2/src/libs/icp/`
*   **必需文件**:
    1.  `service.ts`: 包含完整的 `_SERVICE` 类型定义和 `idlFactory` (核心接口描述)。
    2.  `index.ts`: 包含 Actor 创建工厂函数 (`createActor`)。

**操作建议**:
直接将 `upnetwork-v2/src/libs/icp/` 目录下的 `service.ts` 和 `index.ts` 复制到 `webpay/src/libs/icp/`。

## 3. 后端 API (NodeJS)

KYC 校验和 Order 更新依赖于 Node.js 中间层服务。

| 服务名称 | Host URL | 关键端点 |
| :--- | :--- | :--- |
| **Backend Host** | `https://service.vly.money` | - |
| **NodeJS Backend** | `https://up-service.onta.network` | `/api/kyc/sumsub_token` (用于获取 KYC Token) |
| **Invite Host** | `https://up-service.onta.network` | - |

> **数据来源**: `upnetwork-v2/.env`

## 4. UI 素材资源

为保持视觉风格统一，建议复用以下图片资源：

*   **Logo**: `OntapayLogo.png`, `upnetwork-logo.png`
*   **登录背景**: `login-bg.png` (关键视觉元素)
*   **图标**: `kyc.png` (用于 KYC 状态展示), `success-bg.png` (支付成功页背景)

**操作建议**:
将 `upnetwork-v2/src/assets/images` 目录下的相关图片复制到 `webpay/src/assets/img/`。

## 5. Token 与合约配置 (参考)

虽然本次主要涉及登录，但支付链路可能需要用到以下配置：

*   **Solana Program ID**: `9p5HSP4mt68CqkS7yw5ZEabA3u5Eo6UKvt7BUcW29bdv`
*   **USDC Mint**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
*   **Solana RPC**: `https://black-side-dawn.solana-mainnet.quiknode.pro/34914fab50708164e45c152a3bb6135d85ae7611`

## 6. 开发注意事项

1.  **WebAuthn API 差异**:
    *   `upnetwork-v2` 使用的是 React Native 的 `react-native-passkey` 库。
    *   `webpay` (Web) 应使用浏览器原生的 `navigator.credentials` API。
    *   **关键点**: 在处理 `navigator.credentials.create()` (注册) 和 `navigator.credentials.get()` (登录) 的返回值时，Web 端返回的是 `ArrayBuffer`，需要转换为 `Base64URL` 字符串才能发送给后端 Canister。RN 库通常会自动处理这一步，Web 端需手动处理。

2.  **存储差异**:
    *   `upnetwork-v2` 使用 `MMKV` 存储 Identity。
    *   `webpay` 应使用 `localStorage` 或 `IndexedDB` 存储序列化后的 Identity 及其过期时间。

3.  **依赖安装**:
    `webpay` 需要安装以下 ICP 相关 SDK:
    ```bash
    yarn add @dfinity/agent @dfinity/candid @dfinity/principal @dfinity/identity
    ```
