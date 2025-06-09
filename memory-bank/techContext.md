# σ₃: Technical Context

_v1.1 | Created: 2024-12-28 | Updated: 2024-12-28_
_Π: 🏗️DEVELOPMENT | Ω: 🔍RESEARCH_

## 🛠️ Technology Stack

### 🖥️ Frontend Core

- **React 19.1.0**: 最新版本，支持并发特性
- **TypeScript 5.8.3**: 强类型支持，提升开发体验
- **Vite 6.3.5**: 快速构建工具，HMR支持
- **TanStack Router 1.120.3**: 类型安全的路由解决方案

### 🎨 UI/UX Framework

- **Tailwind CSS 4.1.6**: 原子化CSS框架
- **DaisyUI 5.0.35**: Tailwind组件库
- **Radix UI**: 无障碍访问的原始组件
  - `@radix-ui/react-dialog`: 对话框组件
  - `@radix-ui/react-slot`: 插槽组件
- **Lucide React 0.512.0**: 现代图标库

### ⛓️ Blockchain Integration

- **@solana/web3.js 1.87.6**: Solana区块链SDK
- **@solana/spl-token 0.4.13**: SPL代币标准
- **@okxconnect/solana-provider 1.8.6**: OKX钱包连接器
- **Trust Wallet SDK**: Trust Wallet连接器 (计划集成)
- **viem 2.30.0**: 以太坊兼容库
- **tweetnacl 1.0.3**: 加密算法库

### 🔧 Development Tools

- **ESLint 9.25.0**: 代码质量检查
- **TypeScript ESLint 8.30.1**: TS专用规则
- **Autoprefixer 10.4.21**: CSS前缀自动添加
- **PostCSS 8.5.3**: CSS后处理器

### 📦 Build & Bundle

- **Rollup Plugin Inject 5.0.5**: 依赖注入
- **Vite Plugin Node Polyfills 0.23.0**: Node.js兼容性
- **TanStack Router Plugin 1.120.3**: 路由代码生成

## 🌐 Environment Configuration

### 📁 Project Structure

```
src/
├── api/              # API调用逻辑
├── assets/           # 静态资源
│   └── img/         # 图片资源
├── components/       # 可复用组件
├── hooks/           # 自定义Hooks
├── routes/          # 页面路由
│   └── webpay/      # 支付相关页面
│       └── order_id/ # 订单详情页
├── types/           # TypeScript类型定义
├── utils/           # 工具函数
└── wallets/         # 钱包集成
    ├── adapters/    # 钱包适配器
    │   ├── okx/     # OKX钱包
    │   ├── phantom/ # Phantom钱包
    │   └── trust/   # Trust Wallet (计划开发)
    ├── components/  # 钱包UI组件
    ├── provider/    # 钱包Provider
    ├── types/       # 钱包类型定义
    └── utils/       # 钱包工具函数
```

### ⚙️ Build Scripts

```json
{
  "dev": "vite --host --mode test",
  "build:test": "tsc -b && vite build --mode test",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

### 🔧 Configuration Files

- **vite.config.ts**: Vite构建配置
- **tsconfig.json**: TypeScript编译配置
- **tsconfig.app.json**: 应用专用TS配置
- **tsconfig.node.json**: Node.js环境TS配置
- **tailwind.config.js**: Tailwind CSS配置
- **eslint.config.js**: ESLint规则配置

## 📱 Development Environment

### 🎯 Package Manager

- **Yarn 1.22.22**: 项目指定的包管理器
- **Lock文件**: yarn.lock 确保依赖版本一致性

### 🔍 Development Features

- **HMR**: 热模块替换，快速开发反馈
- **TypeScript**: 编译时类型检查
- **ESLint**: 实时代码质量检查
- **Vite Dev Server**: 开发服务器，支持 --host 模式

### 🌍 Browser Support

- **现代浏览器**: ES2020+ 支持
- **移动端**: iOS Safari, Chrome Mobile
- **桌面端**: Chrome, Firefox, Safari, Edge
- **Web3**: MetaMask, OKX, Phantom 等钱包扩展

## 🔐 Security Considerations

- **CSP**: 内容安全策略配置
- **HTTPS**: 生产环境强制HTTPS
- **钱包安全**: 私钥永不离开用户设备
- **输入验证**: 严格的用户输入校验

## 🚀 Performance Optimizations

- **代码分割**: 路由级别的懒加载
- **Tree Shaking**: 未使用代码自动移除
- **资源压缩**: Gzip/Brotli 压缩
- **缓存策略**: 静态资源长期缓存
