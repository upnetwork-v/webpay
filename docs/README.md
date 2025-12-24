# PayNow 扫码支付文档总结

本次调研和文档编写工作已完成，以下是所有文档的索引和说明。

---

## 📁 文档索引

### 1. PRD 文档
**路径：** `docs/prd/paynow-scan-to-pay-prd.md`
**用途：** 产品需求文档，定义功能范围、用户故事、验收标准
**更新状态：** ✅ 已根据后端澄清更新

**关键章节：**
- § 2 - 目标与非目标
- § 4 - 用户故事（5个）
- § 7 - API 规范（已移除 verifyCryptoTransaction）
- § 10 - 验收检查清单

---

### 2. 开发备忘文档
**路径：** `docs/memo/paynow-scan-to-pay-dev-memo.md`
**用途：** 开发实施指南，澄清技术细节和潜在陷阱
**更新状态：** ✅ 已根据后端澄清更新

**关键章节：**
- § 1 - PRD 风险与问题清单（已澄清问题转移到 ✅ 区）
- § 2 - 关键实现细节（createPayout参数、验证流程）
- § 3 - 完整数据流图
- § 7 - 参考代码片段

---

### 3. 技术调研文档
**路径：** `docs/memo/扫码支付能力调研备忘.md`
**用途：** 前期技术可行性调研，webpay 支付能力分析
**更新状态：** ✅ 已完成

**关键结论：**
- webpay 支付能力完全满足需求，无需封装
- Memo 格式与 upnetwork-v2 完全兼容
- 只需新增 Payout API 和 QR 解析模块

---

### 4. 完整迁移指南
**路径：** `.gemini/antigravity/brain/.../scan_to_pay_migration_guide.md`
**用途：** upnetwork-v2 → webpay 完整功能迁移技术指南
**更新状态：** ✅ 已完成（包含 PayNow/VietQR/PayMongo）

**关键章节：**
- § 2 - 业务流程分析（含 Mermaid 流程图）
- § 3 - 技术栈对比
- § 5 - 需迁移的核心模块
- § 7 - 实现步骤建议（5个阶段，预估 11 天）

---

## ✅ 后端澄清事项

根据后端确认，以下问题已解决：

| 原问题 | 澄清结果 |
|--------|---------|
| createPayout 是否需要传 paymentAddress？ | ❌ 不需要传入，后端会在响应中返回 |
| Solana 是否需要 verifyCryptoTransaction？ | ❌ 不需要，直接轮询 getPayoutRecord 即可 |
| payoutData.id 是否就是 orderId？ | ✅ 是的，memo 使用 `{"webpay":{"orderId":"payoutId"}}` |
| cryptoChain、cryptoCurrency 从哪获取？ | ✅ 后端响应中包含，无需前端硬编码 |

---

## 🔧 关键实现要点

### createPayout API 调用

```typescript
// ✅  正确的调用方式
const response = await createPayout({
  entityType: 'company',
  entityValue: payNowId,
  value: BigNumber(payAmount).multipliedBy(100).toString(),
  currency: 'SGD',
  cryptoCurrency: 'USDC',
  cryptoChain: 'SOLANA',
  country: 'SG',
  remark: referenceId,
  qrString,
  // 不需要传 paymentAddress
});

// 后端响应
{
  code: 200,
  data: {
    id: '...',                 // Payout 订单 ID（用于 Memo）
    cryptoChain: 'SOLANA',      // 后端返回
    cryptoCurrency: 'USDC',     // 后端返回
    paymentAddress: '...',      // 收款地址（后端返回）
    cryptoAmount: '...',        // 需支付数量
    // ...
  }
}
```

### 支付验证流程

```typescript
// 1. 广播交易
const txSignature = await sendRawTransaction(signedTx);

// 2. 轮询 getPayoutRecord（无需 verifyCryptoTransaction）
for (let i = 0; i < 60; i++) {
  const record = await getPayoutRecord(payoutData.id);

  if (record.data.fiatPaymentStatus === 'success') {
    // ✅ 支付成功
    break;
  }

  await sleep(3000);
}
```

### 交易 Memo

```typescript
// 自动添加到交易中
{
  "webpay": {
    "orderId": payoutData.id  // 使用 Payout 订单 ID
  }
}
```

---

## 📋 开发检查清单

### 前置准备
- [ ] 阅读 PRD 文档
- [ ] 阅读开发备忘文档
- [ ] 确认 USDC Token Mint 地址：`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- [ ] 确认 Payout API Base URL：`https://uni-service.uniwebpay.com/uni-service/api`

### 代码迁移
- [ ] 安装依赖：`yarn add html5-qrcode bignumber.js`
- [ ] 复制 `paynow.ts` 到 `src/utils/paynow.ts`
- [ ] 创建 `src/api/payout.ts`
- [ ] 创建 `src/types/payout.ts`
- [ ] 创建 `src/constants/token.ts`（定义 USDC_TOKEN_MINT）

### 页面开发
- [ ] `/wallet` 添加扫码入口
- [ ] `/wallet/scan` 扫码页面
- [ ] `/wallet/pay/paynow` 支付页面（input/preview步骤）

### 测试
- [ ] Phantom 钱包测试
- [ ] OKX 钱包测试
- [ ] 余额不足场景
- [ ] 订单超时场景

---

## 🎯 下一步行动

1. **与后端对齐**：确认 Payout API 已上线
2. **环境配置**：确认使用 Mainnet 还是 Devnet
3. **开始开发**：按照 PRD § 5 功能需求逐项实现
4. **持续沟通**：遇到问题及时与后端/产品确认

---

## 📞 联系方式

如有疑问，请参考：
- PRD 文档 - 了解功能需求
- 开发备忘 - 了解技术细节
- 迁移指南 - 了解完整迁移方案

---

*最后更新：2024-12-24*
