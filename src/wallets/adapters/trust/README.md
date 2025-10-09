# Trust Wallet Adapter

Trust Wallet 适配器 - 基于 WalletConnect V2 协议实现

## 📋 功能特性

- ✅ WalletConnect V2 标准协议
- ✅ 连接钱包（3次重试机制 + 30秒超时）
- ✅ 交易签名（60秒超时 + 防钓鱼）
- ✅ Session 持久化（24小时有效期）
- ✅ 自动恢复连接状态
- ✅ 完整的错误处理和日志记录
- ✅ 安全监控（可疑活动检测）

## 🏗️ 架构

```
trust/
├── TrustWalletAdapter.ts  # 主适配器实现 (520+ 行)
├── constants.ts           # 常量定义
├── logo.png              # Trust Wallet Logo
└── README.md             # 本文件
```

## 🔧 使用方法

### 基本使用

```typescript
import { createAdapter } from "@/wallets/adapters/adapterFactory";

// 创建 Trust Wallet 适配器
const adapter = createAdapter("trust");

// 连接钱包
await adapter.connect();
// 会自动跳转到 Trust Wallet App，用户批准后返回

// 检查连接状态
if (adapter.isConnected()) {
  const publicKey = adapter.getPublicKey();
  console.log("Connected:", publicKey);
}

// 签名交易
const signedTx = await adapter.signTransaction(transaction);

// 广播交易
const signature = await adapter.sendRawTransaction(signedTx);

// 断开连接
await adapter.disconnect();
```

### 通过 Context 使用（推荐）

```typescript
import { useWallet } from "@/wallets/provider/useWallet";

function PaymentComponent() {
  const { selectWallet, connect, signTransaction, state } = useWallet();

  // 选择 Trust Wallet
  await selectWallet("trust");

  // 连接
  await connect();

  // 签名
  const signedTx = await signTransaction(tx);
}
```

## 🔐 安全特性

### 1. 页面可见性监控

防止钓鱼攻击 - 当页面在签名过程中被隐藏时，会记录可疑活动：

```typescript
// 自动监控，无需手动调用
// 如果检测到可疑行为，会记录到 SecurityMonitor
```

### 2. 交易验证

签名前验证交易数据：

- ✅ 检查 `recentBlockhash`
- ✅ 检查 `feePayer`
- ✅ 检查连接状态

### 3. Session 安全

- ✅ 24小时自动过期
- ✅ 加密存储到 localStorage
- ✅ 自动清理过期 session

## ⚙️ 配置

### 环境变量

需要在 `.env` 文件中配置：

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

获取 Project ID：

1. 访问 https://cloud.walletconnect.com
2. 创建项目
3. 复制 Project ID

### 常量配置

可在 `constants.ts` 中自定义：

```typescript
// 超时时间
CONNECTION_TIMEOUT = 30000; // 30秒
TRANSACTION_TIMEOUT = 60000; // 60秒

// 重试配置
RETRY_ATTEMPTS = 3;
RETRY_DELAY = 2000; // 2秒

// Session 有效期
SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24小时
```

## 📱 测试

### 前置条件

1. 安装 Trust Wallet App（v8.0+）

   - iOS: https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409
   - Android: https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp

2. 创建/导入钱包
3. 准备测试代币（Solana devnet 或 mainnet）

### 测试流程

1. **连接测试**

   ```bash
   # 启动开发服务器
   yarn dev

   # 在移动设备浏览器打开应用
   # 选择 Trust Wallet
   # 点击 Connect
   # 应该跳转到 Trust Wallet App
   # 在 Trust Wallet 中批准连接
   # 应该返回网页，显示已连接
   ```

2. **支付测试**

   ```bash
   # 创建测试订单
   # 选择支付
   # 应该跳转到 Trust Wallet
   # 批准交易
   # 返回网页，验证交易成功
   ```

3. **错误场景测试**
   - [ ] 用户取消连接
   - [ ] 用户取消签名
   - [ ] 连接超时
   - [ ] 网络异常

## 🐛 已知限制

1. **需要移动设备**

   - Desktop 上无法使用（Trust Wallet 主要是移动应用）
   - 可以使用 Trust Wallet 浏览器扩展（如有）

2. **依赖 WalletConnect Relay**

   - 需要网络连接到 relay.walletconnect.org
   - 如果 Relay 服务中断，会有重试机制

3. **Session 过期**
   - 24小时后需要重新连接
   - 自动清理过期 session

## 📊 日志和调试

### 查看日志

```typescript
import { WalletLogger } from "@/wallets/utils/logger";

// 获取所有日志
const logs = WalletLogger.getLogs();

// 筛选 Trust Wallet 日志
const trustLogs = WalletLogger.getLogs({ walletType: "trust" });

// 导出日志
const exported = WalletLogger.exportLogs();
console.log(exported);
```

### 查看可疑活动

```typescript
import { SecurityMonitor } from "@/wallets/utils/securityMonitor";

// 获取可疑活动记录
const activities = SecurityMonitor.getActivities();

// 导出记录
const report = SecurityMonitor.exportActivities();
```

## 🔗 相关文档

- [Trust Wallet 官方文档](https://developer.trustwallet.com/developer/develop-for-trust/deeplinking)
- [WalletConnect V2 文档](https://docs.walletconnect.com/2.0/)
- [项目集成方案](../../../../doc/调研%20Trust%20Wallet%20集成方案.md)
- [风险评估报告](../../../../doc/Trust%20Wallet%20风险深度评估与优化方案.md)

## 📝 更新日志

### v1.0.0 (2025-10-09)

- ✅ 初始实现
- ✅ WalletConnect V2 集成
- ✅ 完整的连接和签名功能
- ✅ 安全防护机制
- ✅ 错误处理和日志系统
- ✅ UI 组件支持

---

_最后更新: 2025-10-09_
