# PRD: Popup (Top-Up) 功能迁移与实现

| 属性     | 值                        |
| -------- | ------------------------- |
| 版本     | 1.0                       |
| 状态     | 草稿                      |
| 创建日期 | 2025-12-29                |
| 作者     | Antigravity               |
| 需求类型 | 全栈 (逻辑迁移 + UI 重构) |
| 复杂度   | 中等                      |

---

## 1. 概述

### 1.1 背景
`upnetwork-v2` 移动端应用目前包含一个完整的入金（Top-Up）流程，允许用户生成 Solana 充值地址（通过 ICP Canister）、生成二维码、轮询链上交易状态以及查看充值历史。
随着 `webpay` 项目进行登录方式重构（从 Google OAuth 迁移至 ICP Passkeys），Web 端也需要具备相同的入金能力，以实现用户资产在 Web 和 App 端的互通。

### 1.2 问题描述
1.  **功能缺失**：目前 `webpay` 缺乏加密货币入金功能。
2.  **代码复用**：移动端的入金逻辑（地址生成、轮询、历史记录）经过验证，需要迁移到 Web 端，但需适配 Web 环境（如存储、UI 组件）。
3.  **依赖关系**：该功能强依赖于登录重构后的 Identity 系统，需确保二者无缝集成。

### 1.3 解决方案概述
1.  **逻辑迁移**：将 `upnetwork-v2` 中的 `useTopUpAddress`, `useTopUpPolling`, `TopUpBridgeService` 等核心钩子和通过 Service 逻辑一直到 Web 环境。
    *   存储层：`MMKV` -> `localStorage`。
    *   网络层：复用 `HttpAgent`，适配 Web `fetch`。
2.  **UI 重构**：使用 React DOM 重写二维码展示页和历史记录页，替换 React Native 组件。
3.  **集成**：接入登录重构后提供的 `AuthContext` 获取 `DelegationIdentity`。

---

## 2. 目标与指标

### 2.1 目标

| 编号 | 目标     | 优先级   |
| ---- | -------- | -------- |
| G1   | Web 端能生成与 App 端一致的 Solana 充值地址（基于同一 Principal） | 必须实现 |
| G2   | 提供二维码展示和地址复制功能 | 必须实现 |
| G3   | 实现交易状态自动轮询（Pending -> Success/Failed） | 必须实现 |
| G4   | 展示充值历史记录，包含 KYT 状态反馈 | 必须实现 |
| G5   | 适配 Web 端交互体验（弹窗/独立页面） | 必须实现 |

### 2.2 非目标
- 本次不涉及后端 Canister 或 HTTP API 的修改。
- 不支持 Fiat（法币）充值方式的迁移（仅限 Crypto/Scan Scode）。

### 2.3 成功标准

| 标准     | 描述   | 验证方式 |
| -------- | ------ | -------- |
| 地址一致性 | 同一账号在 Web 和 App 生成的地址必须相同 | 对比两端生成的 Solana 地址字符串 |
| 充值到账 | 向该地址转账 SOL/USDC，Web 端能自动检测并提示成功 | 实际转账测试，观察 Toast/通知 |
| 历史同步 | App 端产生的充值记录，Web 端能同步显示 | 登录同一账号，对比历史记录列表 |

---

## 3. 用户分析

### 3.1 目标用户

| 用户类型 | 特征   | 核心需求 |
| -------- | ------ | -------- |
| Web 支付用户 | 在电商/Web 场景发起支付 | 需要快速充值资金到账户以完成支付 |
| 多端用户 | 同时使用 App 和 Web | 希望资产和记录在两端保持实时同步 |

### 3.2 用户旅程

1.  **入口**：用户在 Wallet 页面点击 "Deposit" 或 "Top Up"。
2.  **操作**：
    *   系统自动检测/生成入金地址。
    *   用户看到二维码和地址，进行扫码转账。
    *   系统轮询检测到交易，显示 "Minting..." -> "Success"。
3.  **结果**：余额更新，历史记录增加一条新记录。

---

## 4. 用户故事

### US-1: 查看入金二维码
**作为** 登录用户
**我想要** 获取我的专属 Solana 充值地址和二维码
**以便** 我可以从外部钱包向账户充值 USDC/SOL

**验收标准：**
- [ ] 若由 Canister 生成地址，通过缓存或 API 获取。
- [ ] 页面清晰展示二维码和文本地址。
- [ ] 提供"复制"按钮。

### US-2: 充值状态反馈
**作为** 正在充值的用户
**我想要** 知道我的转账何时被系统确认
**以便** 我确信资金已安全到账

**验收标准：**
- [ ] 转账后，页面自动弹出 "检测到交易，正在铸造 vUSD..." 的提示。
- [ ] 成功后，弹出 "充值成功" 并刷新余额。
- [ ] 失败（如 KYT 拦截），明确提示失败原因。

### US-3: 查看充值历史
**作为** 用户
**我想要** 查看过往的充值记录
**以便** 核对我的资产变动

**验收标准：**
- [ ] 列表展示时间、金额、Token 类型、状态。
- [ ] 状态包含：Pending, Success, Failed, KYT Failed。

---

## 5. 功能需求

### F1: 地址生成服务 (TopUp Bridge)
- **描述**：通过 ICP Canister 生成用户唯一的 Solana 托管地址。
- **输入**：`DelegationIdentity` (来自 Auth Context)。
- **输出**：`solana_address`, `solana_usdc_address`。
- **逻辑迁移**：
    *   源文件：`upnetwork-v2/src/utils/TopUpBridgeService.ts`
    *   变更：移除 RN 依赖，保持 Canister 调用逻辑不变。

### F2: 轮询与状态检测 (Polling Hook)
- **描述**：定期调用后端 API 检查该地址是否有新交易。
- **频次**：参考 App 设定（如每 15 秒）。
- **输入**：`solana_address`, `authToken`。
- **逻辑迁移**：
    *   源文件：`upnetwork-v2/src/hooks/useTopUpPolling.ts`
    *   UI 反馈：将 `react-native-toast-message` 替换为 Web 端 Toast 组件（如 `sonner`）。

### F3: 历史记录查询
- **描述**：分页或全量拉取充值历史。
- **输入**：`solana_address`, `network` (mainnet/devnet)。
- **API**：`/api/cross-chain/get_charge_history`
- **逻辑迁移**：
    *   源文件：`upnetwork-v2/src/api/backend/top-up.ts`
    *   适配：确保 `fetch` 请求头包含正确的 `auth-token`。

---

## 6. UI 交互规范

### 6.1 TopUp 模态框/页面
- **布局**：
    *   顶部：标题 "Deposit Crypto"。
    *   中部：二维码居中（使用 `react-qr-code`）。
    *   下部：文本地址 + 复制图标。
    *   底部：状态提示区（如 "Checking for transactions..."）。

### 6.2 历史记录列表
- **展示形式**：通过表格或卡片列表展示。
- **字段**：Date, Amount, Status, TxHash (可点击跳转 Explorer)。
- **状态样式**：
    *   Success: 绿色
    *   Pending: 黄色/橙色
    *   Failed/KYT: 红色

---

## 7. API 规范 (后端 & Canister)

**后端 API (NodeJS)**
1.  **`GET /api/cross-chain/get_tx_hash_list`**
    *   用途：轮询获取新交易 Mint 结果。
    *   参数：`address`, `network`。
    *   Headers: `auth-token`。
2.  **`GET /api/cross-chain/get_charge_history`**
    *   用途：获取历史记录。
    *   参数：`address`, `network`。
    *   Headers: `auth-token`。

**Canister 接口 (ICP)**
*   `generate_address_mapping()`: 生成/获取 Solana 地址。

---

## 8. 依赖与集成

### 8.1 依赖关系
| 依赖项 | 说明 |
| ------ | ---- |
| **Login Refactor** | 必须等待登录重构完成，提供 `DelegationIdentity` 和 `AuthContext` |
| **Canister IDL** | 复用 `upnetwork-v2` 的 IDL 定义文件 |

### 8.2 技术依赖迁移
| 原生 (RN) | Web 替代方案 |
| --------- | ------------ |
| `react-native-mmkv` | `localStorage` 或 `IndexedDB` |
| `react-native-toast-message` | `sonner` 或 `react-hot-toast` |
| `Clipboard` | `navigator.clipboard` |
| `View/Text` | `div/span/p` |
| `FlatList` | `div` (map渲染) 或 `<table>` |

---

## 9. 技术可行性

### 9.1 核心逻辑复用
绝大部分业务逻辑封装在 Hooks 和 Service 层，属于纯 TS/JS 逻辑，可直接复用，仅需修改少量的宿主环境 API（如 Storage）。

### 9.2 跨域与网络
Web 端调用 ICP Canister 需确保 `agent-js` 配置正确（Web 端通常需要配置 `host`，生产环境直接访问 icp0.io 即可）。后端 API 需确认 CORS 配置允许 Web 端域名访问。

---

## 10. 验收检查清单

### 10.1 功能检查
- [ ] **地址生成**：首次进入能自动调用 Canister 生成地址并缓存。
- [ ] **缓存机制**：二次进入优先读取缓存，不重复请求 Canister。
- [ ] **轮询机制**：在页面停留时，能自动发起轮询请求。
- [ ] **通知反馈**：模拟入金，能收到"Minting"和"Success"的 Toast 通知。

### 10.2 UI/UX 检查
- [ ] 二维码扫描可读。
- [ ] 复制地址功能正常。
- [ ] 移动端 H5 适配（响应式布局）。

### 10.3 数据一致性
- [ ] Web 端显示的历史记录与 App 端一致。
- [ ] 余额更新及时。

---

## 11. 风险评估

| 风险 | 可能性 | 影响 | 应对措施 |
| ---- | ------ | ---- | -------- |
| **Identity 格式差异** | 低 | 高 | 确保 Web 端登录生成的 `DelegationIdentity` 与 App 端使用的库版本兼容，保证 Principal 一致。 |
| **CORS 问题** | 中 | 中 | 提前测试 Web 端调用后端 API 的连通性，必要时配置后端 CORS 白名单。 |
| **浏览器兼容性** | 低 | 低 | 主要是 WebAuthn 和 Clipboard API，主流浏览器均支持。 |

---

## 12. 附录

### 12.1 变更记录

| 版本 | 日期 | 变更内容 |
| ---- | ---- | -------- |
| 1.0 | 2025-12-29 | 初稿创建 |
