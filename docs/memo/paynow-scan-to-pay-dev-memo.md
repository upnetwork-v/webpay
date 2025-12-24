# PayNow 扫码支付 - 开发备忘

> 本文档是 PRD 的补充，针对 PRD 中存在的模糊点和实施风险进行澄清，确保开发不偏离预期。

---

## 1. PRD 风险与问题清单

### 1.1 ✅ 已澄清问题（后端确认）

| # | 问题描述 | 澄清说明 |
|---|----------|---------|
| **1** | **`paymentAddress` 来源** | ✅ **后端返回**：createPayout API 响应中包含 paymentAddress，这是收款地址 |
| **2** | **verifyCryptoTransaction 是否需要** | ✅ **不需要**：Solana 链支付直接轮询 getPayoutRecord，根据 fiatPaymentStatus 判断 |
| **3** | **Memo 中的 orderId** | ✅ **正确**：payoutData.id 就是 orderId，memo 使用 `{"webpay":{"orderId":"payoutId"}}` |
| **4** | **USDC 配置来源** | ✅ **后端返回**：cryptoChain、cryptoCurrency、paymentAddress 都从 API 响应获取 |

### 1.2 � 剩余高优先级问题

| # | 问题描述 | 风险等级 | 解决方案 |
|---|----------|---------|---------|
| 5 | **Token 地址的获取方式** | 中 | USDC Token Mint 地址需前端配置（环境变量或常量），后端只返回 paymentAddress |
| 6 | **entityType 判断逻辑** | 低 | 当前可固定为 'company'，后续优化可根据 proxyType 判断 |

### 1.3 🟢 低优先级 / 已明确问题

| # | 问题描述 | 状态 |
|---|----------|------|
| 7 | Memo 格式 | ✅ 已明确：`{"webpay":{"orderId":"payoutId"}}` |
| 8 | 金额单位 | ✅ 已明确：API 传"分"（×100），如 10.00 SGD 传 "1000" |
| 9 | 超时时间 | ✅ 已明确：5 分钟（300秒） |
| 10 | 轮询参数 | ✅ 已明确：使用 payoutData.id 作为 payoutRecordId |

---

## 2. 关键实现细节澄清

### 2.1 createPayout API 参数说明

**正确的参数语义（参照 upnetwork-v2 源码）：**

```typescript
const res = await createPayout({
  entityType: 'company',           // 固定值，后续可按 proxyType 判断
  entityValue: payNowId,           // 收款方标识（手机号/UEN）
  value: BigNumber(payAmount).multipliedBy(100).toString(), // 金额（分）
  currency: 'SGD',                  // 固定值
  cryptoCurrency: 'USDC',           // 注意：不是 paymentInfo.payTokenSymbol
  cryptoChain: 'SOLANA',            // 固定值（大写）
  paymentAddress: USDC_PAYMENT_ADDRESS,  // ⚠️ 这是【收款方的】预设地址，非用户地址
  remark: referenceId,              // QR 码中的 referenceId（可选）
  country: 'SG',                    // 固定值
  qrString: qrString,               // 原始 QR 字符串（可选）
});
```

**⚠️ 关键点：`paymentAddress` 是后端预设的收款钱包地址，不是用户的付款地址！**

### 2.2 USDC 配置

从 upnetwork-v2 的 `token.ts` 提取，webpay 需定义：

```typescript
// src/constants/token.ts 或环境变量
export const USDC_CONFIG = {
  // Solana Mainnet USDC Token Mint Address
  tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',

  // 收款地址（后端关联的钱包）
  paymentAddress: '9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3',

  decimal: 6,
  symbol: 'USDC',
  chainName: 'SOLANA',
};
```

**建议确认：** 与后端确认 `paymentAddress` 是否与 upnetwork-v2 共用同一收款地址。

### 2.3 交易创建参数

当前 webpay 的 `createSPLTransferTransaction` 签名：

```typescript
interface TransactionParams {
  from: string;        // 用户钱包地址
  to: string;          // 收款地址（来自 payoutData.paymentAddress）
  tokenAmount: string; // 转账金额（来自 payoutData.cryptoAmount）
  tokenAddress: string;// USDC Token Mint Address
  orderId: string;     // ⚠️ 这里传 payoutData.id
}
```

**✅ 调用示例：**
```typescript
const tx = await createSPLTransferTransaction({
  from: walletPublicKey,
  to: payoutData.paymentAddress,      // 从 API 响应获取
  tokenAmount: payoutData.cryptoAmount, // 从 API 响应获取
  tokenAddress: USDC_TOKEN_MINT,       // 前端常量配置
  orderId: payoutData.id,              // Payout 订单 ID
});
```

### 2.4 verifyCryptoTransaction 参数

**问题：** `blockIndex` 对 Solana 语义不明确

**upnetwork-v2 源码分析：**
```typescript
// 在 PaymentCardPaynow.tsx 中
const verifyResult = await verifyCryptoTransaction({
  blockIndex: parseInt(txHashString),  // 这里把 txHash 转成数字
});
```

这个实现有问题！Solana 的交易签名是 base58 字符串，不能直接 parseInt。

**建议：**
1. 与后端确认 Solana 交易应传什么参数
2. 可能需要后端调整接口，支持传 `txSignature: string` 参数

### 2.5 Memo 内容

当前 webpay 的 `createSPLTransferTransaction` 会自动添加 Memo：

```typescript
const memoIx = createMemoInstruction(
  JSON.stringify({
    webpay: {
      orderId: payoutData.id,  // ✅ 使用 payoutData.id
    },
  }),
  new PublicKey(from)
);
```

**✅ 结论：** 无需修改，传入 `payoutData.id` 作为 `orderId` 参数即可。

---

## 3. 数据流详解

### 3.1 完整数据流

```
[扫描 QR 码]
     ↓
[parsePayNowQR(qrString)] → { payNowId, amount?, referenceId?, ... }
     ↓
[用户确认金额] → payAmount (SGD)
     ↓
[createPayout API]
  请求: { entityValue: payNowId, value: payAmount*100, ... }
  响应: { id, cryptoAmount, paymentAddress, cryptoChain, cryptoCurrency, ... }
     ↓
[用户确认支付]
     ↓
[createSPLTransferTransaction]
  参数: {
    from: userWallet,
    to: payoutData.paymentAddress,  // ← 后端返回
    tokenAmount: payoutData.cryptoAmount,  // ← 后端返回
    tokenAddress: USDC_TOKEN_MINT,  // ← 前端配置
    orderId: payoutData.id
  }
     ↓
[钱包签名] → signedTx
     ↓
[广播交易] → txSignature
     ↓
[轮询 getPayoutRecord(payoutData.id)] ← ✅ 直接轮询，无需 verifyCryptoTransaction
  每 3 秒检查 fiatPaymentStatus
     ↓
[支付成功] (fiatPaymentStatus === 'success')
```

### 3.2 关键状态管理

```typescript
// 推荐的状态设计
interface PayNowPaymentState {
  // 步骤
  step: 'input' | 'preview' | 'signing' | 'broadcasting' | 'verifying' | 'success' | 'failed';

  // QR 解析结果
  payNowData: PayNowQRData | null;

  // 用户输入
  payAmount: string;           // SGD 金额（用户输入）
  hasPresetAmount: boolean;    // QR 是否包含金额

  // Payout 订单
  payoutData: CreatePayoutResponse | null;

  // 交易
  txSignature: string | null;

  // 错误
  error: string | null;

  // 超时
  expiresAt: number | null;    // payoutData.orderExpiresAtTs
}
```

---

## 4. 待确认事项清单

开发前需与相关方确认：

### 4.1 后端确认 ✅

| # | 问题 | 负责人 | 状态 |
|---|------|-------|------|
| 1 | Solana 是否需要 verifyCryptoTransaction？ | 后端 | ✅ 已确认：不需要 |
| 2 | paymentAddress 来源？ | 后端 | ✅ 已确认：后端返回 |
| 3 | Memo 格式是否正确？ | 后端 | ✅ 已确认：正确 |

### 4.2 产品确认 ✅

| # | 问题 | 负责人 | 状态 |
|---|------|-------|------|
| 4 | 扫描非 PayNow 二维码（VietQR/PayMongo）是提示"暂不支持"还是隐藏？ | 产品 | 待确认 |
| 5 | 支付成功后是否需要分享功能？ | 产品 | 待确认 |

---

## 5. 开发检查清单

### 5.1 环境配置

- [ ] 确认 USDC Token 地址（Mainnet vs Devnet）
- [ ] 确认 Payout API Base URL
- [ ] 安装依赖：`yarn add html5-qrcode bignumber.js`

### 5.2 代码迁移

- [ ] 复制 `paynow.ts` 到 `src/utils/paynow.ts`
- [ ] 创建 `src/api/payout.ts`（createPayout, verifyCryptoTransaction, getPayoutRecord）
- [ ] 创建 `src/types/payout.ts`（PayNow 和 Payout 类型定义）
- [ ] 创建 `src/constants/token.ts`（USDC 配置）

### 5.3 页面开发

- [ ] `/wallet` 页面添加扫码入口
- [ ] `/wallet/scan` 扫码页面
- [ ] `/wallet/pay/paynow` 支付页面（包含 input/preview/signing 等步骤）

### 5.4 Hook 开发

- [ ] `usePayNowPayment` hook（封装完整支付流程）
  - 状态管理
  - createPayout 调用
  - 余额检查
  - 交易创建
  - 验证轮询

### 5.5 测试

- [ ] 准备 PayNow QR 码测试样本（有金额/无金额）
- [ ] Phantom 钱包测试
- [ ] OKX 钱包测试
- [ ] 余额不足场景
- [ ] 超时场景

---

## 6. 建议的技术决策

### 6.1 路由设计

```typescript
// src/routes/wallet/scan.tsx
// src/routes/wallet/pay/paynow.tsx

// 或使用搜索参数在同一页面管理状态
// /wallet/pay?type=paynow&step=input
```

**推荐：** 使用独立路由，便于后续扩展 VietQR、PayMongo。

### 6.2 状态管理

**方案 A：** 使用 URL 搜索参数 + React State
- 优点：刷新不丢失上下文
- 缺点：敏感数据不应放 URL

**方案 B：** 使用 Zustand Store
- 优点：统一状态管理
- 缺点：刷新丢失状态

**推荐：** 方案 B，扫码支付流程不应被刷新中断，可在 localStorage 做临时持久化。

### 6.3 错误处理策略

| 错误类型 | 处理方式 |
|---------|---------|
| QR 识别失败 | 继续扫描，不提示 |
| QR 格式不支持 | Toast 提示，返回扫码页 |
| createPayout 失败 | Toast 提示，停留输入页 |
| 余额不足 | 禁用按钮 + 红色提示 |
| 签名取消 | Toast 提示，停留预览页 |
| 广播失败 | Toast 提示，允许重试 |
| 验证超时 | 显示"请稍后确认"，提供链上查询链接 |

---

## 7. 参考代码片段

### 7.1 PayNow QR 解析调用

```typescript
import { isLikelyPayNowQR, parsePayNowQR } from '@/utils/paynow';

function handleQrCodeResult(qrString: string) {
  if (isLikelyPayNowQR(qrString)) {
    const payNowData = parsePayNowQR(qrString);
    if (payNowData) {
      // 跳转到支付页面
      navigate('/wallet/pay/paynow', {
        state: {
          payNowId: payNowData.proxyValue,
          amount: payNowData.amount || '',
          referenceId: payNowData.referenceId || '',
          qrString,
        }
      });
    }
  } else {
    toast.error('暂不支持此类型二维码');
  }
}
```

### 7.2 createPayout 调用

```typescript
import BigNumber from 'bignumber.js';

async function handleCreatePayout(
  payNowId: string,
  payAmount: string,
  referenceId: string,
  qrString: string
) {
  const response = await createPayout({
    entityType: 'company',
    entityValue: payNowId,
    value: new BigNumber(payAmount).multipliedBy(100).toString(),
    currency: 'SGD',
    cryptoCurrency: 'USDC',
    cryptoChain: 'SOLANA',
    country: 'SG',
    remark: referenceId,
    qrString,
    // ⚠️ 不需要传 paymentAddress，后端会返回
  });

  if (response.code === 200 &&response.data) {
    return response.data;
  }
  throw new Error(response.msg || 'createPayout failed');
}
```

### 7.3 交易创建与发送

```typescript
import { createSPLTransferTransaction } from '@/utils/transaction';

// USDC Token Mint 地址（前端配置）
const USDC_TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function handlePayment(
  walletPublicKey: string,
  payoutData: CreatePayoutResponse,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  sendRawTransaction: (tx: Transaction) => Promise<string>
) {
  // 1. 创建交易
  const tx = await createSPLTransferTransaction({
    from: walletPublicKey,
    to: payoutData.paymentAddress,    // 从 API 响应获取
    tokenAmount: payoutData.cryptoAmount, // 从 API 响应获取
    tokenAddress: USDC_TOKEN_MINT,     // 前端配置
    orderId: payoutData.id,             // Payout 订单 ID
  });

  // 2. 签名
  const signedTx = await signTransaction(tx);

  // 3. 广播
  const txSignature = await sendRawTransaction(signedTx);

  return txSignature;
}
```

---

## 8. 版本记录

| 版本 | 日期 | 变更内容 |
|-----|------|---------|
| 1.0 | 2024-12-24 | 初始版本 |
