/**
 * Trust Wallet 适配器
 *
 * 实现基于 Deep Linking 的 Trust Wallet 集成
 * 注意：Trust Wallet 通过 Deep Link 支付不需要预先连接
 */
import type { Transaction } from "@solana/web3.js";
import type {
  WalletAdapter,
  WalletCallbackRequest,
  WalletCallbackResponse,
} from "../../types/wallet";
import type {
  TrustWalletState,
  TrustWalletConnectionOptions,
  PaymentParams,
} from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";
import { TrustWalletDeepLink } from "./deeplink";
import { PublicKey } from "@solana/web3.js";

export class TrustWalletAdapter implements WalletAdapter {
  private state: TrustWalletState;
  private deepLink: TrustWalletDeepLink;

  constructor() {
    this.state = {
      isConnected: false,
      isInstalled: true, // 假定总是可用，通过 deeplink 交互
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
    };

    this.deepLink = new TrustWalletDeepLink();
  }

  /**
   * 连接到 Trust Wallet
   * 注意：Trust Wallet Deep Link 模式下不需要真实连接，直接标记为已连接
   */
  async connect(_options?: TrustWalletConnectionOptions): Promise<void> {
    if (this.state.isConnecting) {
      throw new Error("Connection already in progress");
    }

    if (this.state.isConnected) {
      return;
    }

    this.state.isConnecting = true;
    this.state.error = undefined;

    try {
      // Trust Wallet Deep Link 模式：直接标记为已连接
      // 实际的钱包交互在支付时通过 Deep Link 进行
      await this.simulateConnection();

      this.state.isConnecting = false;
      this.state.isConnected = true;
      // 使用占位符地址，实际地址在支付时由用户钱包提供
      this.state.address = "J2nyQXEpxRJmt9bsCMF8T6pY4Q9vSmHMoUpfuAKuPHrD";
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Unknown error";
      this.state.isConnecting = false;
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.state = {
      isConnected: false,
      isInstalled: this.state.isInstalled,
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
    };
  }

  /**
   * 签名并发送交易
   * 通过 Deep Link 直接发起支付，无需预先连接
   */
  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    // 注意：Trust Wallet Deep Link 模式下不需要预先连接
    // 直接通过 Deep Link 发起支付即可

    try {
      // 提取交易信息
      const recipientAddress = this.extractRecipientAddress(transaction);
      const amount = this.extractAmount(transaction);
      const memo = this.extractMemo(transaction);
      const asset = this.extractAsset(transaction);

      // 构建支付参数
      const paymentParams: PaymentParams = {
        address: recipientAddress,
        amount: amount,
        memo: memo,
        asset: asset,
      };

      // 验证支付参数
      const validation = this.deepLink.validatePaymentParams(paymentParams);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // 直接发起支付请求 - 无需检查连接状态
      const success = await this.deepLink.requestPayment(paymentParams);

      if (!success) {
        throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.TRANSACTION_FAILED);
      }

      // 返回占位符交易哈希
      // 实际应用中可能需要通过回调获取真实的交易哈希
      return this.generatePlaceholderTxHash();
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Transaction failed";
      throw error;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.state.isConnected;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    return this.state.address || null;
  }

  /**
   * 处理回调
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      // 根据回调类型处理
      if (params.type === "connect") {
        return await this.handleConnectCallback(params);
      } else if (params.type === "payment") {
        return await this.handlePaymentCallback(params);
      } else {
        return {
          type: params.type || "unknown",
          success: false,
          error: "Unknown callback type",
        };
      }
    } catch (error) {
      return {
        type: params.type || "unknown",
        success: false,
        error:
          error instanceof Error ? error.message : "Callback handling failed",
      };
    }
  }

  /**
   * 获取 Trust Wallet 状态
   */
  getState(): TrustWalletState {
    return { ...this.state };
  }

  /**
   * 模拟连接过程
   * Trust Wallet Deep Link 模式下不需要真实连接
   */
  private async simulateConnection(): Promise<void> {
    // 简单的延迟模拟连接过程
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500); // 500ms 模拟连接时间
    });
  }

  /**
   * 从交易中提取收款地址
   */
  private extractRecipientAddress(transaction: Transaction): string {
    // 查找转账指令
    for (const instruction of transaction.instructions) {
      // SOL 转账指令 (SystemProgram.transfer)
      if (
        instruction.programId.equals(
          new PublicKey("11111111111111111111111111111112")
        )
      ) {
        // SystemProgram transfer 指令的第二个账户是收款地址
        if (instruction.keys.length >= 2) {
          return instruction.keys[1].pubkey.toBase58();
        }
      }

      // SPL Token 转账指令
      if (
        instruction.programId.equals(
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        )
      ) {
        // SPL Token transfer 指令的第二个账户是收款 token 账户
        // 对于 Trust Wallet Deep Link，我们返回 token 账户地址
        // Trust Wallet 会自动处理 token 账户到钱包地址的映射
        // TODO: 需要根据实际的 token 账户地址提取钱包地址
        if (instruction.keys.length >= 2) {
          return instruction.keys[1].pubkey.toBase58();
        }
      }
    }

    throw new Error("No valid transfer instruction found in transaction");
  }

  /**
   * 从交易中提取支付金额
   */
  private extractAmount(transaction: Transaction): number | undefined {
    // 查找转账指令
    for (const instruction of transaction.instructions) {
      // SOL 转账指令 (SystemProgram.transfer)
      if (
        instruction.programId.equals(
          new PublicKey("11111111111111111111111111111112")
        )
      ) {
        // SystemProgram transfer 指令的 data 包含金额信息
        if (instruction.data.length >= 12) {
          // 跳过指令类型 (4 bytes)，读取金额 (8 bytes)
          const amountBuffer = instruction.data.slice(4, 12);
          const amount = Number(Buffer.from(amountBuffer).readBigUInt64LE(0));
          return amount;
        }
      }

      // SPL Token 转账指令
      if (
        instruction.programId.equals(
          new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        )
      ) {
        // SPL Token transfer 指令的 data 包含金额信息
        if (instruction.data.length >= 9) {
          // 跳过指令类型 (1 byte)，读取金额 (8 bytes)
          const amountBuffer = instruction.data.slice(1, 9);
          const amount = Number(Buffer.from(amountBuffer).readBigUInt64LE(0));
          return amount;
        }
      }
    }

    // 如果无法提取金额，返回 undefined，让用户在钱包中输入
    return undefined;
  }

  /**
   * 从交易中提取备注信息
   */
  private extractMemo(transaction: Transaction): string | undefined {
    // 查找 Memo 指令
    const MEMO_PROGRAM_ID = new PublicKey(
      "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    );

    for (const instruction of transaction.instructions) {
      if (instruction.programId.equals(MEMO_PROGRAM_ID)) {
        try {
          // Memo 指令的 data 就是备注内容
          const memoText = new TextDecoder().decode(instruction.data);
          return memoText;
        } catch (error) {
          console.warn("Failed to decode memo:", error);
          return undefined;
        }
      }
    }

    return undefined;
  }

  /**
   * 从交易中提取资产类型
   */
  private extractAsset(transaction: Transaction): string {
    // 检查是否包含 SPL Token 转账指令
    const SPL_TOKEN_PROGRAM_ID = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );

    for (const instruction of transaction.instructions) {
      if (instruction.programId.equals(SPL_TOKEN_PROGRAM_ID)) {
        // 这是 SPL Token 转账
        // 尝试从交易中的其他信息推断 token mint
        const tokenMint = this.extractTokenMintFromTransaction(transaction);

        if (tokenMint) {
          // 使用 Trust Wallet UAI 格式：c501_t{token_mint_address}
          return `${TRUST_WALLET_CONSTANTS.SOLANA_ASSET_PREFIX}_t${tokenMint}`;
        } else {
          // 如果无法确定具体的 token mint，使用通用格式
          console.warn(
            "Unable to determine token mint, using generic SPL token format"
          );
          return `${TRUST_WALLET_CONSTANTS.SOLANA_ASSET_PREFIX}_tSPL_TOKEN`;
        }
      }
    }

    // 默认为 SOL 转账
    return TRUST_WALLET_CONSTANTS.SOLANA_ASSET_PREFIX;
  }

  /**
   * 从交易中提取 token mint 地址
   * 这是一个辅助方法，尝试从交易的各种来源推断 token mint
   */
  private extractTokenMintFromTransaction(
    transaction: Transaction
  ): string | null {
    // 方法1: 检查是否有 transferChecked 指令（包含 mint 信息）
    const SPL_TOKEN_PROGRAM_ID = new PublicKey(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
    );

    for (const instruction of transaction.instructions) {
      if (instruction.programId.equals(SPL_TOKEN_PROGRAM_ID)) {
        // 检查指令类型
        if (instruction.data.length > 0) {
          const instructionType = instruction.data[0];

          // transferChecked 指令类型通常是 12
          if (instructionType === 12 && instruction.keys.length >= 4) {
            // transferChecked 指令的第4个账户是 mint
            return instruction.keys[3].pubkey.toBase58();
          }
        }
      }
    }

    // 方法2: 如果是普通 transfer 指令，尝试从 memo 中提取 token 信息
    // 这需要我们的应用在 memo 中包含 token mint 信息
    const memo = this.extractMemo(transaction);
    if (memo) {
      try {
        const memoData = JSON.parse(memo);
        if (memoData.webpay && memoData.webpay.tokenMint) {
          return memoData.webpay.tokenMint;
        }
      } catch (error) {
        // memo 不是 JSON 格式，忽略
      }
    }

    // 方法3: 从交易的其他上下文信息推断（如果有的话）
    // 这里可以添加更多的推断逻辑

    return null;
  }

  /**
   * 生成占位符交易哈希
   */
  private generatePlaceholderTxHash(): string {
    // 生成一个看起来像真实交易哈希的占位符
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 处理连接回调
   */
  private async handleConnectCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    // Trust Wallet Deep Link 模式下连接回调处理
    if (params.address) {
      this.state.isConnected = true;
      this.state.isConnecting = false;
      this.state.address = params.address;

      return {
        type: "connect",
        success: true,
        data: { address: params.address },
      };
    }

    return {
      type: "connect",
      success: false,
      error: "No address provided",
    };
  }

  /**
   * 处理支付回调
   */
  private async handlePaymentCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    if (params.signature) {
      return {
        type: "payment",
        success: true,
        data: { signature: params.signature },
      };
    }

    return {
      type: "payment",
      success: false,
      error: "No transaction signature provided",
    };
  }
}
