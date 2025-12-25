# PRD: PayMongo 扫码支付（Scan-to-Pay 第二批次）

| 属性 | 值 |
| --- | --- |
| 版本 | 1.1 |
| 状态 | **已确认** |
| 创建日期 | 2025-12-25 |
| 作者 | AI Assistant |
| 需求类型 | 全栈需求 |
| 复杂度 | 中等 |
| 关联项目 | upnetwork-v2 → webpay 功能迁移 |

---

## 1. 概述

### 1.1 背景

继第一批次成功实现 PayNow（新加坡）扫码支付后，根据《Scan-to-Pay 功能迁移技术文档》规划，第二批次将支持 **PayMongo（菲律宾）** 扫码支付。
PayMongo 是菲律宾主流的支付方式，支持扫描 PH 地区的 EMVCo 标准 QR 码进行支付。

### 1.2 问题描述

当前 webpay 仅支持 PayNow 扫码，无法识别和处理菲律宾 PayMongo 的 QR 码。

### 1.3 解决方案概述

采用并行路由策略，在 webpay 中新增 PayMongo 专用流程：
1.  **扫码识别**：修改 `scan.tsx` 集成 PayMongo QR 识别逻辑（复用 `upnetwork-v2`）。
2.  **金额输入**：新增 `/wallet/pay/paymongo` 页面，处理无金额 QR 码的金额输入。
3.  **支付确认**：新增 `/wallet/pay/paymongo/$payoutId` 页面，展示 PHP 订单并支持 USDC 支付。
4.  **底层适配**：扩展 `CreatePayoutParams` 类型定义，支持菲律宾参数。

---

## 2. 目标与指标

### 2.1 目标

| 编号 | 目标 | 优先级 |
| --- | --- | --- |
| G1 | 支持识别 PayMongo（菲律宾）QR 码 | 必须 |
| G2 | 支持创建 PHP 币种的 Payout 订单 | 必须 |
| G3 | 支持使用 Solana USDC 支付 PayMongo 订单 | 必须 |
| G4 | 复用 upnetwork-v2 的 PayMongo 解析算法，确保准确性 | 应该 |

### 2.2 非目标

- ❌ 本批次不实现 VietQR（越南）
- ❌ 本批次暂不支持 ICP 链支付（仅 Solana）
- ❌ 本批次暂不支持多币种选择（固定 Sol USDC）

### 2.3 成功标准

| 标准 | 描述 | 验证方式 |
| --- | --- | --- |
| 识别率 | PayMongo QR 码识别准确率与 App 端一致 | 对比测试 |
| 支付流程 | 从扫码到支付 PHP 订单全流程通畅 | 端到端测试 |

---

## 3. 用户故事

### US-1: 扫描 PayMongo QR 码

**作为** webpay 用户
**我想要** 扫描菲律宾 PayMongo 商户二维码
**以便** 识别收款方信息并支付 PHP

**验收标准：**
- [ ] 扫描页能自动区分 PayNow 和 PayMongo 码
- [ ] 识别成功后：
    - 若 QR 含金额，自动创建订单并跳转支付页
    - 若 QR 不含金额，跳转输入页

### US-2: 输入 PHP 金额

**作为** webpay 用户
**我想要** 输入支付金额（PHP）
**以便** 向商户支付指定金额

**验收标准：**
- [ ] 输入框显示 PHP 单位
- [ ] 校验最小支付金额（后端建议值为 1 PHP）

### US-3: 确认支付信息

**作为** webpay 用户
**我想要** 查看以 PHP 计价的订单金额和对应的 USDC 支付额
**以便** 确认汇率和支付成本

**验收标准：**
- [ ] 显示法币符号 `₱` 或 `PHP`
- [ ] 汇率计算正确
- [ ] 显示 PayMongo 特有的收款信息（Account No. / Mobile No.）
- [ ] 支持 Solana 钱包签名支付

---

## 4. 功能需求与技术细节

| 编号 | 需求描述 | 优先级 | 技术实现参考 |
| --- | --- | --- | --- |
| F1 | PayMongo QR 解析 | 必须 | 迁移 `upnetwork-v2/src/utils/paymongo.ts` |
| F2 | 扫描页路由分发 | 必须 | 修改 `scan.tsx`，增加 `isLikelyPayMongo` 判断 |
| F3 | PayMongo 页面 | 必须 | 新增 `/wallet/pay/paymongo` 路由目录 |
| F4 | Payout API 适配 | 必须 | 更新 `CreatePayoutParams` 类型定义 |

### F1: PayMongo QR 解析 (技术细节)

- **逻辑迁移**：需将 `upnetwork-v2` 中的 `parsePayMongo` 和 `isLikelyPayMongo` 函数完整迁移至 `webpay/src/utils/paymongo.ts`。
- **依赖库**：需引入 `bignumber.js` (如尚未引入)。
- **输出结构**：与 PayNow 类似，但字段不同 (Account Number, Account Type, Remark, Purpose)。

### F4: Payout API 适配 (类型定义)

根据后端已支持的 PayMongo 参数，需修改 `src/types/payout.ts` 中的 `CreatePayoutParams` 接口：

```typescript
export interface CreatePayoutParams {
  entityType: 'company' | 'individual'
  entityValue: string // PayMongo Account/Mobile Number
  value: string       // Cents (e.g. 100 = 1.00 PHP)
  currency: 'SGD' | 'PHP'
  cryptoCurrency: 'USDC'
  cryptoChain: 'SOLANA'
  country: 'SG' | 'PH'
  remark?: string
  qrString?: string
  // PayMongo 特定字段
  purpose?: string    // e.g. "PERSONAL_REMITTANCE"
}
```

#### 后端接口示例 (参考)

后端已确认支持以下格式参数：

```json
{
  "entityType": "individual",
  "entityValue": "999999990001",
  "currency": "PHP",
  "value": 100, // 注意：前端传参时建议转为 string 类型的 "100" 以保持统一
  "cryptoCurrency": "USDC", // 本项目使用 SOLANA USDC
  "cryptoChain": "SOLANA",  // 本项目使用 SOLANA
  "country": "PH",
  "qrString": "...",
  "purpose": "PERSONAL_REMITTANCE",
  "remark": "Payment via Paymongo QR"
}
```

---

## 5. 验收检查清单

- [ ] `src/utils/paymongo.ts` 单元测试通过
- [ ] 扫描页能识别并跳转 PayMongo 流程
- [ ] Payout 创建接口调用成功 (Currency: PHP)
- [ ] 支付页面正确展示 PHP 金额和 USDC 估算值
- [ ] 支付成功后能正确轮询到 `fiatPaymentStatus: success`
