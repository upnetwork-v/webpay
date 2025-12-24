# PRD: PayNow 扫码支付（Scan-to-Pay 第一批次）

| 属性     | 值                               |
| -------- | -------------------------------- |
| 版本     | 1.0                              |
| 状态     | 草稿                             |
| 创建日期 | 2024-12-24                       |
| 作者     | AI Assistant                     |
| 需求类型 | 全栈需求                         |
| 复杂度   | 中等                             |
| 关联项目 | upnetwork-v2 → webpay 功能迁移   |

---

## 1. 概述

### 1.1 背景

upnetwork-v2 (React Native App) 已实现扫码→支付功能，支持 PayNow（新加坡）、VietQR（越南）、PayMongo（菲律宾）等多种 QR 码支付。现需将该功能迁移到 webpay (Web React) 项目中，以支持 Web 端用户使用扫码支付。

本 PRD 为 **第一批次**，仅实现 **PayNow（新加坡）扫码支付**功能。

### 1.2 问题描述

当前 webpay 仅支持通过 UniWeb 订单链接进行支付（`/webpay/order_id/$orderId`），无法支持用户扫描实体商户 PayNow QR 码进行支付。

### 1.3 解决方案概述

在 webpay `/wallet` 路由下新增扫码入口，用户通过浏览器摄像头扫描 PayNow QR 码后：
1. 解析 EMVCo 标准 QR 码数据
2. 调用 Payout API 创建支付订单
3. 使用 Solana USDC 完成链上转账
4. 验证交易并展示支付结果

---

## 2. 目标与指标

### 2.1 目标

| 编号 | 目标                                         | 优先级   |
| ---- | -------------------------------------------- | -------- |
| G1   | 用户可在 webpay 扫描 PayNow QR 码完成支付    | 必须实现 |
| G2   | 支付使用 Solana USDC，复用现有钱包适配器     | 必须实现 |
| G3   | 支付流程与 upnetwork-v2 保持一致的用户体验   | 应该实现 |
| G4   | QR 解析工具从 upnetwork-v2 复用，确保兼容性  | 应该实现 |

### 2.2 非目标

- ❌ 本批次不实现 VietQR（越南）支付
- ❌ 本批次不实现 PayMongo（菲律宾）支付
- ❌ 本批次不实现 ICP 链支付（仅 Solana USDC）
- ❌ 本批次不实现支付历史记录页面
- ❌ 本批次不实现多币种选择（固定 USDC）

### 2.3 成功标准

| 标准               | 描述                                           | 验证方式         |
| ------------------ | ---------------------------------------------- | ---------------- |
| 扫码识别成功率     | PayNow QR 码识别成功率 ≥ 95%                   | 测试多种 QR 样本 |
| 支付流程完成率     | 从扫码到支付成功的完整流程可走通               | 端到端测试       |
| 交易 Memo 兼容性   | 后端可正确解析交易 Memo 关联订单               | 后端日志验证     |
| 钱包兼容性         | Phantom / OKX 钱包都能完成支付                 | 手动测试         |

---

## 3. 用户分析

### 3.1 目标用户

| 用户类型         | 特征                                 | 核心需求                       |
| ---------------- | ------------------------------------ | ------------------------------ |
| 新加坡商户消费者 | 在新加坡实体店消费                   | 用加密货币支付 PayNow QR 码    |
| Web 端用户       | 使用桌面/移动浏览器访问 webpay       | 无需下载 App 即可完成扫码支付  |
| 现有钱包用户     | 已连接 Phantom/OKX 钱包              | 快捷完成支付无需重新连接钱包   |

### 3.2 用户旅程

```
1. [入口] 用户登录 webpay → 进入 /wallet 页面
      ↓
2. [扫码] 点击"扫码支付"按钮 → 弹出摄像头取景框
      ↓
3. [识别] 扫描 PayNow QR 码 → 系统识别并解析
      ↓
4. [输入] 跳转支付页面 → 显示收款方信息，用户输入/确认金额
      ↓
5. [预览] 点击"继续" → 调用 createPayout API → 显示汇率和加密货币金额
      ↓
6. [支付] 点击"确认支付" → 钱包弹窗签名 → 广播交易
      ↓
7. [验证] 交易上链 → 调用 verifyCryptoTransaction → 轮询 getPayoutRecord
      ↓
8. [完成] 显示支付成功页面 → 可查看交易详情
```

---

## 4. 用户故事

### US-1: 扫描 PayNow QR 码

**作为** webpay 用户
**我想要** 使用手机/电脑摄像头扫描商户的 PayNow QR 码
**以便** 识别收款方信息并发起加密货币支付

**验收标准：**
- [ ] 扫码按钮在 /wallet 页面可见
- [ ] 点击后请求摄像头权限
- [ ] 成功识别 PayNow QR 码后自动跳转支付页面
- [ ] 非 PayNow 格式的 QR 码显示"不支持的二维码"提示

**优先级：** 必须

---

### US-2: 输入支付金额

**作为** webpay 用户
**我想要** 在支付页面输入或确认支付金额（SGD）
**以便** 明确我要支付的法币金额

**验收标准：**
- [ ] 如果 QR 码包含金额，自动填充且不可编辑
- [ ] 如果 QR 码不包含金额，显示金额输入框
- [ ] 金额格式校验（最多 2 位小数，最小 0.01 SGD）
- [ ] 显示收款方标识（payNowId）

**优先级：** 必须

---

### US-3: 预览支付详情

**作为** webpay 用户
**我想要** 在确认支付前看到汇率和需支付的 USDC 数量
**以便** 确认交易细节后再签名

**验收标准：**
- [ ] 显示法币金额（SGD）
- [ ] 显示兑换汇率
- [ ] 显示需支付的 USDC 数量
- [ ] 显示收款地址（部分隐藏）
- [ ] 显示订单有效期（5 分钟倒计时）
- [ ] 余额不足时显示警告并禁用支付按钮

**优先级：** 必须

---

### US-4: 完成支付

**作为** webpay 用户
**我想要** 点击确认后通过钱包签名并完成支付
**以便** 将加密货币转给收款方

**验收标准：**
- [ ] 点击"确认支付"后显示 loading 状态
- [ ] 唤起钱包签名弹窗（Phantom/OKX）
- [ ] 签名成功后广播交易
- [ ] 广播成功后显示"交易确认中"状态
- [ ] 支付成功后跳转结果页面

**优先级：** 必须

---

### US-5: 查看支付结果

**作为** webpay 用户
**我想要** 在支付完成后看到交易详情
**以便** 确认支付已成功

**验收标准：**
- [ ] 显示交易成功图标和文案
- [ ] 显示交易金额（法币 + 加密货币）
- [ ] 显示收款方信息
- [ ] 提供 Solana Explorer 链接查看交易
- [ ] 提供"返回钱包"按钮

**优先级：** 必须

---

## 5. 功能需求

| 编号 | 需求描述                           | 优先级   | 备注                           |
| ---- | ---------------------------------- | -------- | ------------------------------ |
| F1   | 摄像头 QR 码扫描                   | 必须实现 | 使用 html5-qrcode 库           |
| F2   | PayNow QR 码解析（EMVCo 标准）     | 必须实现 | 复用 upnetwork-v2 paynow.ts    |
| F3   | Payout API 集成                    | 必须实现 | createPayout / verify / record |
| F4   | 支付金额输入与校验                 | 必须实现 | SGD 格式，2 位小数             |
| F5   | 汇率计算与展示                     | 必须实现 | 后端返回，前端展示             |
| F6   | Solana USDC 转账                   | 必须实现 | 复用现有 transaction.ts        |
| F7   | 交易签名（Phantom/OKX）            | 必须实现 | 复用现有钱包适配器             |
| F8   | 交易状态轮询                       | 必须实现 | 最多 60 次，每 3 秒            |
| F9   | 支付结果展示                       | 必须实现 | 成功/失败状态                  |
| F10  | 订单超时处理                       | 必须实现 | 5 分钟超时返回输入步骤         |

### F1: 摄像头 QR 码扫描

- **描述：** 使用 html5-qrcode 库实现浏览器摄像头扫码
- **输入：** 用户点击"扫码支付"按钮
- **输出：** 识别到的 QR 码字符串
- **异常处理：**
  - 无摄像头权限 → 提示用户授权
  - 识别失败 → 持续扫描直到成功或用户取消
  - 非 PayNow 格式 → 提示"暂不支持此类型二维码"

### F3: Payout API 集成

- **描述：** 调用后端 Payout API 创建支付订单
- **输入：** PayNow ID、金额、货币、支付链信息
- **输出：** Payout 订单详情（包含收款地址、加密货币金额）
- **异常处理：**
  - API 调用失败 → 显示错误提示，允许重试
  - 汇率过期 → 提示重新获取

---

## 6. UI 交互规范

### 6.1 页面结构

```
/wallet                    - 钱包主页（新增扫码入口）
/wallet/scan               - 扫码页面（摄像头取景框）
/wallet/pay/paynow         - PayNow 支付页面
/wallet/pay/paynow/result  - 支付结果页面（可选，也可复用现有设计）
```

### 6.2 UI 状态矩阵

| 元素名称     | 可见条件         | 可用条件                | 文案/样式变化规则          |
| ------------ | ---------------- | ----------------------- | -------------------------- |
| 扫码支付按钮 | 已登录用户       | 始终可用                | -                          |
| 金额输入框   | 支付页面         | QR 码不包含金额时可编辑 | 包含金额时禁用             |
| 继续按钮     | 输入步骤         | 金额 > 0.01 SGD         | 无效时显示灰色             |
| 确认支付按钮 | 预览步骤         | 余额充足 & 未过期       | 余额不足显示"余额不足"     |
| Loading 状态 | 任何 API 调用中  | -                       | 显示 spinner               |

### 6.3 状态流转图

```
[扫码页面]
    ↓ 识别成功
[输入步骤] ←────────────────────┐
    ↓ 点击继续                   │
[createPayout API 调用中]        │
    ↓ 成功                       │
[预览步骤]                       │
    ↓ 点击确认支付               │ 订单超时
[钱包签名中]                     │
    ↓ 签名成功                   │
[交易广播中]                     │
    ↓ 广播成功                   │
[验证轮询中] ────────────────────┘ 轮询超时/失败
    ↓ 验证成功
[支付成功页面]
```

### 6.4 加载与反馈

| 操作         | 加载态表现           | 成功反馈         | 失败反馈               |
| ------------ | -------------------- | ---------------- | ---------------------- |
| 扫码识别     | 取景框持续扫描       | 自动跳转         | Toast 提示不支持       |
| 创建 Payout  | 按钮显示 loading     | 进入预览步骤     | Toast 显示错误信息     |
| 钱包签名     | 按钮显示"签名中..."  | 自动进入广播     | Toast 显示取消/失败    |
| 交易广播     | 按钮显示"发送中..."  | 进入验证步骤     | Toast 显示广播失败     |
| 验证轮询     | 显示"确认中..."动画  | 跳转成功页       | 显示失败页面           |

---

## 7. API 规范

### 7.1 后端 API Base URL

```
https://uni-service.uniwebpay.com/uni-service/api
```

### 7.2 接口定义

#### `POST /payout/create`

创建 Payout 支付订单

- **认证：** 不需要（或按后端要求）
- **权限：** 所有用户

**Request Body:**

```typescript
interface CreatePayoutParams {
  entityType: 'company' | 'individual';
  entityValue: string;        // PayNow ID（手机号/UEN）
  value: string;              // 金额（分，如 "1000" = 10.00 SGD）
  currency: 'SGD';            // 法币类型
  cryptoCurrency: 'USDC';     // 加密货币类型
  cryptoChain: 'SOLANA';      // 链名称
  paymentAddress: string;     // 付款方 Solana 地址
  country: 'SG';              // 国家
  remark?: string;            // 备注（可选）
  qrString?: string;          // 原始 QR 字符串（可选）
}
```

**Response:**

```typescript
interface CreatePayoutResponse {
  code: number;               // 200 = 成功
  msg: string;
  data: {
    id: string;               // Payout 订单 ID
    fiatAmount: number;       // 法币金额
    fiatCurrency: string;     // 法币类型
    cryptoCurrency: string;   // 加密货币类型
    cryptoAmount: string;     // 需支付的加密货币数量（最小单位）
    cryptoDecimal: number;    // 精度
    cryptoChain: string;      // 链名称
    paymentAddress: string;   // 收款地址
    exchangeRate: string;     // 汇率
    orderExpiresAt: string;   // ISO 时间
    orderExpiresAtTs: number; // 时间戳
    cryptoPaymentStatus: 'pending' | 'success' | 'failed';
    fiatPaymentStatus: 'pending' | 'success' | 'failed';
  } | null;
}
```

**错误码：**

| HTTP Status | 错误场景       | Response                         |
| ----------- | -------------- | -------------------------------- |
| 400         | 参数错误       | `{ code: 400, msg: "..." }`      |
| 500         | 服务器错误     | `{ code: 500, msg: "..." }`      |

---

#### `POST /payout/verify-crypto-transaction`

验证链上交易

**Request Body:**

```typescript
interface VerifyCryptoTransactionParams {
  blockIndex: number;  // 对于 Solana 应传入 slot 或签名的数字形式
}
```

**Response:**

```typescript
interface VerifyCryptoTransactionResponse {
  code: number;
  msg: string;
  data: {
    payoutRecordId: string;
    blockIndex: number;
    cryptoPaymentStatus: string;
    verifiedAt: string;
  } | null;
}
```

---

#### `GET /payout/record/{id}`

查询 Payout 记录状态

**Response:**

```typescript
interface PayoutRecordResponse {
  code: number;
  msg: string;
  data: {
    id: string;
    cryptoPaymentStatus: 'pending' | 'verified' | 'failed';
    fiatPaymentStatus: 'pending' | 'success' | 'failed';
    // ... 其他字段
  } | null;
}
```

### 7.3 前端所需字段清单

| 字段名              | 类型    | 用途                     | 来源 API          |
| ------------------- | ------- | ------------------------ | ----------------- |
| `payoutId`          | string  | 订单标识                 | POST /payout/create |
| `cryptoAmount`      | string  | 显示需支付的 USDC 数量   | POST /payout/create |
| `cryptoDecimal`     | number  | 格式化金额显示           | POST /payout/create |
| `paymentAddress`    | string  | 链上转账目标地址         | POST /payout/create |
| `exchangeRate`      | string  | 显示汇率                 | POST /payout/create |
| `orderExpiresAtTs`  | number  | 计算倒计时               | POST /payout/create |
| `cryptoPaymentStatus` | string | 判断交易是否成功       | GET /payout/record |
| `fiatPaymentStatus` | string  | 判断法币结算是否成功     | GET /payout/record |

---

## 8. 依赖与集成

### 8.1 现有系统分析

| 模块               | 文件                           | 复用方式                 |
| ------------------ | ------------------------------ | ------------------------ |
| Solana 交易创建    | `src/utils/transaction.ts`     | ✅ 直接复用              |
| 钱包适配器         | `src/wallets/*`                | ✅ 直接复用              |
| 支付 Hook          | `src/hooks/usePayment.ts`      | ⚠️ 参考或扩展            |
| API 封装           | `src/api/index.ts`             | ✅ fetchInstance 复用    |
| 认证状态           | `src/stores/authStore.ts`      | ✅ useAuthStore 复用     |

### 8.2 需从 upnetwork-v2 迁移的模块

| 源文件                        | 目标文件                   | 说明                     |
| ----------------------------- | -------------------------- | ------------------------ |
| `src/utils/paynow.ts`         | `src/utils/paynow.ts`      | EMVCo + PayNow 解析      |
| `src/api/backend/order.ts`    | `src/api/payout.ts`        | Payout API（简化版本）   |

### 8.3 新增依赖

| 依赖项       | 类型 | 说明                       |
| ------------ | ---- | -------------------------- |
| html5-qrcode | 新增 | 浏览器摄像头 QR 扫描       |
| bignumber.js | 新增 | 大数计算（金额处理）       |

---

## 9. 技术可行性

### 9.1 技术方案概述

1. **QR 扫描**：使用 `html5-qrcode` 库，支持桌面和手机浏览器
2. **QR 解析**：复用 upnetwork-v2 的 `paynow.ts`，纯 TS 逻辑无需修改
3. **链上交易**：复用现有 `createSPLTransferTransaction` 函数
4. **Memo 格式**：与 upnetwork-v2 完全一致 `{"webpay":{"orderId":"xxx"}}`
5. **钱包签名**：复用现有 Phantom/OKX 适配器

### 9.2 已验证可行性

根据前期调研（见 `doc/扫码支付能力调研备忘.md`）：

- ✅ webpay 现有 Solana USDC 转账能力完整
- ✅ Memo 格式与 upnetwork-v2 完全兼容
- ✅ 钱包适配器可直接复用
- ✅ QR 解析工具为纯 TS，可直接复制

---

## 10. 验收检查清单

### 10.1 后端检查项

- [ ] `/payout/create` API 返回 Solana USDC 支付选项
- [ ] `/payout/verify-crypto-transaction` 可正确解析 Solana 交易
- [ ] `/payout/record/{id}` 返回正确的支付状态
- [ ] 交易 Memo `{"webpay":{"orderId":"xxx"}}` 可被正确解析

### 10.2 前端检查项

**扫码功能：**
- [ ] 扫码按钮在 /wallet 页面可见
- [ ] 摄像头权限请求正常
- [ ] PayNow QR 码可正确识别
- [ ] 非 PayNow 码显示提示

**支付流程：**
- [ ] 输入步骤正确显示收款方信息
- [ ] 预览步骤显示汇率和 USDC 数量
- [ ] 余额不足时支付按钮禁用
- [ ] 订单超时（5 分钟）正确处理

**钱包集成：**
- [ ] Phantom 钱包签名正常
- [ ] OKX 钱包签名正常
- [ ] 交易广播后正确轮询验证

**结果展示：**
- [ ] 支付成功显示交易详情
- [ ] 支付失败显示错误信息
- [ ] Solana Explorer 链接可点击

### 10.3 集成检查项

- [ ] 与现有认证系统集成正常（需登录）
- [ ] 与现有钱包连接状态同步
- [ ] 新路由在导航中可访问

---

## 11. 风险评估

| 风险                       | 可能性 | 影响 | 应对措施                           |
| -------------------------- | ------ | ---- | ---------------------------------- |
| 摄像头兼容性问题           | 中     | 中   | 使用成熟库，测试主流浏览器         |
| Payout API 响应变化        | 低     | 高   | 与后端确认接口契约，添加容错处理   |
| 汇率波动导致支付金额不准确 | 中     | 中   | 订单 5 分钟超时，前端显示倒计时    |
| 交易验证轮询超时           | 低     | 中   | 3 分钟超时后提示用户稍后确认       |

---

## 12. 附录

### 12.1 PayNow QR 码格式说明

PayNow 使用 EMVCo 标准 TLV 格式，关键字段：

| Tag | 名称                | 说明                     |
| --- | ------------------- | ------------------------ |
| 00  | Payload Format      | 固定值 "01"              |
| 26  | Merchant Account    | 包含 PayNow 网络数据     |
| 53  | Transaction Currency| 货币代码（"702" = SGD）  |
| 54  | Transaction Amount  | 金额（可选）             |
| 58  | Country Code        | "SG"                     |
| 59  | Merchant Name       | 商户名称                 |
| 63  | CRC                 | 校验码                   |

Tag 26 内嵌套 TLV 结构：
- 00: "SG.PAYNOW"
- 01: Proxy Type (0=手机, 2=NRIC, 4=UEN)
- 02: Proxy Value

### 12.2 Solana Memo 格式

```typescript
// 交易 Memo 内容
JSON.stringify({
  webpay: {
    orderId: payoutData.id  // Payout 订单 ID
  }
})

// Memo Program ID
"MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
```

### 12.3 术语表

| 术语      | 定义                                           |
| --------- | ---------------------------------------------- |
| PayNow    | 新加坡电子支付系统，支持手机号/UEN 收款        |
| UEN       | Unique Entity Number，新加坡企业唯一编号       |
| EMVCo     | 全球支付标准组织，定义 QR 码 TLV 格式          |
| Payout    | 本系统中的支付订单，包含法币和加密货币信息     |
| USDC      | Circle 发行的美元稳定币，1 USDC ≈ 1 USD        |

### 12.4 参考文档

- [调研文档] `webpay/doc/扫码支付能力调研备忘.md`
- [完整迁移指南] `.gemini/.../scan_to_pay_migration_guide.md`
- [upnetwork-v2 源码] `upnetwork-v2/src/utils/paynow.ts`

### 12.5 变更记录

| 版本 | 日期       | 变更内容 |
| ---- | ---------- | -------- |
| 1.0  | 2024-12-24 | 初稿     |
