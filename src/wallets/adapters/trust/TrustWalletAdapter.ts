/**
 * Trust Wallet 适配器 - WalletConnect v2 实现
 *
 * 使用 WalletConnect v2 Universal Provider 实现真实的钱包连接和交易签名
 * 提供完整的回调机制和会话管理
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
  WalletConnectConfig,
  WalletConnectSession,
} from "./types";
import { TRUST_WALLET_CONSTANTS } from "./constants";
import UniversalProvider from "@walletconnect/universal-provider";
import { WalletConnectModal } from "@walletconnect/modal";

// 本地存储键名
const TRUST_WALLET_SESSION_KEY = "trust_wallet_wc_session";
const TRUST_WALLET_STATE_KEY = "trust_wallet_state";

export class TrustWalletAdapter implements WalletAdapter {
  private state: TrustWalletState;
  private universalProvider: UniversalProvider | null = null;
  private walletConnectModal: WalletConnectModal | null = null;
  private session: WalletConnectSession | null = null;
  private config: WalletConnectConfig;

  constructor() {
    this.config = {
      projectId: TRUST_WALLET_CONSTANTS.WALLETCONNECT.PROJECT_ID,
      metadata: TRUST_WALLET_CONSTANTS.WALLETCONNECT.METADATA,
    };

    this.state = {
      isConnected: false,
      isInstalled: true, // WalletConnect 不需要检测安装
      isConnecting: false,
      address: undefined,
      balance: undefined,
      error: undefined,
      wcSession: undefined,
      wcUri: undefined,
    };

    // 尝试恢复会话
    this.restoreSession();
  }

  /**
   * 初始化 WalletConnect Universal Provider
   */
  private async initializeProvider(): Promise<void> {
    if (this.universalProvider) {
      return;
    }

    try {
      // 验证配置
      if (!this.config.projectId) {
        throw new Error("WalletConnect Project ID is required");
      }

      // 初始化 Universal Provider
      this.universalProvider = await UniversalProvider.init({
        logger: "warn",
        projectId: this.config.projectId,
        metadata: this.config.metadata,
      });

      // 初始化 Modal
      this.walletConnectModal = new WalletConnectModal({
        projectId: this.config.projectId,
        chains: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
      });

      // 设置事件监听器
      this.setupEventListeners();

      console.log("[TrustWalletAdapter] WalletConnect provider initialized");
    } catch (error) {
      console.error(
        "[TrustWalletAdapter] Failed to initialize provider:",
        error
      );
      this.state.error =
        TRUST_WALLET_CONSTANTS.ERRORS.WALLETCONNECT_INIT_FAILED;
      throw error;
    }
  }

  /**
   * 设置 WalletConnect 事件监听器
   */
  private setupEventListeners(): void {
    if (!this.universalProvider) return;

    // 显示 URI (QR 码)
    this.universalProvider.on("display_uri", (uri: string) => {
      console.log("[TrustWalletAdapter] WalletConnect URI:", uri);
      this.state.wcUri = uri;
      // 打开 Modal 显示 QR 码
      if (this.walletConnectModal) {
        this.walletConnectModal.openModal({ uri });
      }
    });

    // 会话提议事件（可能包含账户信息）
    this.universalProvider.on("session_proposal", (proposal: any) => {
      console.log("[TrustWalletAdapter] Session proposal received:", proposal);
    });

    // 会话建立事件
    this.universalProvider.on("session_settle", (session: any) => {
      console.log("[TrustWalletAdapter] Session settled:", session);
      // 尝试从 session_settle 获取更完整的会话信息
      this.handleSessionConnect(session);
    });

    // 会话连接成功
    this.universalProvider.on("session_update", (session: any) => {
      console.log("[TrustWalletAdapter] Session updated:", session);
      this.handleSessionUpdate(session);
    });

    // 账户改变事件
    this.universalProvider.on("accountsChanged", (accounts: string[]) => {
      console.log("[TrustWalletAdapter] Accounts changed:", accounts);
      if (accounts.length > 0) {
        let address = accounts[0];
        // 如果是完整格式，提取地址部分
        if (address.includes(":")) {
          address = address.split(":")[2];
        }

        this.state = {
          ...this.state,
          address: address,
          isConnected: true,
          error: undefined,
        };

        this.saveSession();
        console.log(
          "[TrustWalletAdapter] Address updated from accountsChanged:",
          address
        );
      }
    });

    // 会话删除/断开
    this.universalProvider.on("session_delete", (session: any) => {
      console.log("[TrustWalletAdapter] Session deleted:", session);
      this.handleSessionDelete();
    });

    // 连接事件
    this.universalProvider.on("connect", (session: any) => {
      console.log("[TrustWalletAdapter] Connected:", session);
      this.handleSessionConnect(session);
    });

    // 断开事件
    this.universalProvider.on("disconnect", (session: any) => {
      console.log("[TrustWalletAdapter] Disconnected:", session);
      this.handleSessionDelete();
    });
  }

  /**
   * 处理会话连接
   */
  private handleSessionConnect(session: any): void {
    console.log(
      "[TrustWalletAdapter] handleSessionConnect called with session:",
      {
        hasSession: !!session,
        hasNamespaces: !!session?.namespaces,
        hasSolana: !!session?.namespaces?.solana,
        hasAccounts: !!session?.namespaces?.solana?.accounts,
        accountsLength: session?.namespaces?.solana?.accounts?.length || 0,
        rawSession: session,
      }
    );

    let address: string | undefined;

    // 方法1：尝试从 namespaces.solana.accounts 获取地址 (WalletConnect v2 标准格式)
    if (session?.namespaces?.solana?.accounts?.length > 0) {
      const account = session.namespaces.solana.accounts[0];
      console.log("[TrustWalletAdapter] Processing account from namespaces:", {
        rawAccount: account,
        accountType: typeof account,
      });

      // 从账户字符串中提取地址 (格式: "solana:chainId:address")
      address = account.split(":")[2];
      console.log("[TrustWalletAdapter] Extracted address from namespaces:", {
        fullAccount: account,
        extractedAddress: address,
        splitResult: account.split(":"),
      });
    }
    // 方法2：尝试从 session.accounts 获取地址 (可能的备选格式)
    else if (
      session?.accounts &&
      Array.isArray(session.accounts) &&
      session.accounts.length > 0
    ) {
      console.log(
        "[TrustWalletAdapter] Trying to get address from session.accounts:",
        session.accounts
      );
      const account = session.accounts[0];
      if (typeof account === "string") {
        // 如果是完整格式 "solana:chainId:address"
        if (account.includes(":")) {
          address = account.split(":")[2];
        } else {
          // 如果直接是地址
          address = account;
        }
        console.log(
          "[TrustWalletAdapter] Extracted address from session.accounts:",
          address
        );
      }
    }

    // 先保存会话信息，即使没有地址
    this.session = {
      topic: session.topic,
      accounts: address ? [address] : [],
      chains: session.namespaces?.solana?.chains || [
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      ],
      expiry: session.expiry,
    };

    this.state = {
      ...this.state,
      isConnected: true,
      isConnecting: false,
      wcSession: session,
      error: undefined,
    };

    // 如果通过标准方法获取到了地址，直接设置
    if (address) {
      this.state.address = address;
      this.saveSession();

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.log(
        "[TrustWalletAdapter] Connection successful, address:",
        address
      );
    } else {
      // 如果没有通过标准方法获取到地址，使用 Trust Wallet 的 get_accounts 方法
      console.log(
        "[TrustWalletAdapter] No address found in session, trying Trust Wallet get_accounts method..."
      );
      this.getTrustWalletAccounts();
    }
  }

  /**
   * 使用 Trust Wallet 特有的 get_accounts 方法获取账户信息
   * 根据官方文档：https://developer.trustwallet.com/developer/develop-for-trust/mobile#get-multiple-chain-accounts-from-trust
   */
  private async getTrustWalletAccounts(): Promise<void> {
    if (!this.universalProvider || !this.state.isConnected) {
      console.warn("[TrustWalletAdapter] Cannot get accounts: not connected");
      return;
    }

    try {
      console.log(
        "[TrustWalletAdapter] Requesting accounts using Trust Wallet get_accounts method..."
      );

      // 方法1：使用标准的 WalletConnect request 方法（不指定链）
      let result;
      try {
        result = await this.universalProvider.request({
          method: "get_accounts",
        });
        console.log(
          "[TrustWalletAdapter] get_accounts result (method 1):",
          result
        );
      } catch (error1) {
        console.log(
          "[TrustWalletAdapter] Method 1 failed, trying method 2:",
          error1
        );

        // 方法2：如果有session，尝试直接从UniversalProvider获取accounts
        if (this.universalProvider.session) {
          const session = this.universalProvider.session;
          console.log(
            "[TrustWalletAdapter] Trying to extract accounts from session:",
            session
          );

          // 检查 session 的不同可能位置
          if (session.namespaces?.solana?.accounts) {
            result = session.namespaces.solana.accounts.map(
              (account: string) => {
                const parts = account.split(":");
                return {
                  network: 501, // Solana network ID
                  address: parts[2] || account,
                };
              }
            );
            console.log(
              "[TrustWalletAdapter] Extracted from session.namespaces:",
              result
            );
          }
        }

        if (!result) {
          // 方法3：尝试使用 _formatRequest 和 _sendCallRequest (WalletConnect 1.x 风格)
          console.log(
            "[TrustWalletAdapter] Trying WalletConnect 1.x style request..."
          );

          // 检查是否有 _formatRequest 方法
          const provider = this.universalProvider as any;
          if (
            typeof provider._formatRequest === "function" &&
            typeof provider._sendCallRequest === "function"
          ) {
            const request = provider._formatRequest({
              method: "get_accounts",
            });
            result = await provider._sendCallRequest(request);
            console.log(
              "[TrustWalletAdapter] get_accounts result (method 3):",
              result
            );
          } else {
            throw new Error("No available method to call get_accounts");
          }
        }
      }

      if (Array.isArray(result) && result.length > 0) {
        console.log("[TrustWalletAdapter] Processing accounts result:", result);

        // 查找 Solana 账户 (network: 501 对应 Solana)
        const solanaAccount = result.find((account: any) => {
          // 支持多种格式
          if (typeof account === "string") {
            // 如果是字符串，可能是地址或 "solana:chainId:address" 格式
            return account.includes("solana:") || account.length >= 32; // Solana地址通常32+字符
          }

          if (typeof account === "object" && account !== null) {
            // 如果是对象，检查 network 字段
            return (
              account.network === 501 ||
              account.network === "501" ||
              (account.address && typeof account.address === "string")
            );
          }

          return false;
        });

        if (solanaAccount) {
          let address: string;

          if (typeof solanaAccount === "string") {
            // 如果是字符串格式
            if (solanaAccount.includes(":")) {
              address = solanaAccount.split(":")[2] || solanaAccount;
            } else {
              address = solanaAccount;
            }
          } else {
            // 如果是对象格式
            address = solanaAccount.address;
          }

          console.log("[TrustWalletAdapter] Found Solana account:", {
            solanaAccount,
            extractedAddress: address,
          });

          if (address && address.length >= 32) {
            // 更新状态
            this.state.address = address;
            this.session!.accounts = [address];

            // 保存会话状态
            this.saveSession();

            // 关闭 Modal
            if (this.walletConnectModal) {
              this.walletConnectModal.closeModal();
            }

            console.log(
              "[TrustWalletAdapter] Successfully got Solana address from get_accounts:",
              address
            );
            return;
          }
        }

        // 如果没有找到 Solana 账户，打印所有可用账户
        console.warn(
          "[TrustWalletAdapter] No Solana account found in get_accounts result:"
        );
        result.forEach((account: any, index: number) => {
          console.log(`  Account ${index}:`, account);
        });

        this.state.error = "No Solana account found in wallet";
      } else {
        console.warn(
          "[TrustWalletAdapter] get_accounts returned empty or invalid result:",
          result
        );
        this.state.error = "Unable to retrieve accounts from wallet";
      }
    } catch (error) {
      console.error(
        "[TrustWalletAdapter] Error getting Trust Wallet accounts:",
        error
      );
      this.state.error =
        "Failed to retrieve wallet accounts: " +
        (error instanceof Error ? error.message : "Unknown error");
    }
  }

  /**
   * 处理会话更新
   */
  private handleSessionUpdate(session: any): void {
    // WalletConnect v2 session 结构包含 namespaces
    if (session?.namespaces?.solana?.accounts?.length > 0) {
      const account = session.namespaces.solana.accounts[0];
      const address = account.split(":")[2];

      this.state = {
        ...this.state,
        address: address,
        wcSession: session,
      };

      this.saveSession();
    }
  }

  /**
   * 处理会话删除
   */
  private handleSessionDelete(): void {
    this.session = null;
    this.state = {
      ...this.state,
      isConnected: false,
      isConnecting: false,
      address: undefined,
      wcSession: undefined,
      wcUri: undefined,
    };

    this.clearSession();
    console.log("[TrustWalletAdapter] Session cleared");
  }

  /**
   * 连接到 Trust Wallet
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
      // 初始化 Provider
      await this.initializeProvider();

      if (!this.universalProvider) {
        throw new Error("Failed to initialize Universal Provider");
      }

      // 连接钱包
      await this.universalProvider.connect({
        namespaces: TRUST_WALLET_CONSTANTS.WALLETCONNECT.SOLANA_NAMESPACE,
        skipPairing: false,
      });

      // 连接状态会在事件监听器中更新
      console.log("[TrustWalletAdapter] Connection initiated");

      // 等待一小段时间，让连接事件完全处理
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 如果连接成功但没有地址，主动调用 get_accounts
      if (this.state.isConnected && !this.state.address) {
        console.log(
          "[TrustWalletAdapter] Connection established but no address found, calling get_accounts..."
        );
        await this.getTrustWalletAccounts();

        // 如果第一次尝试失败，等待更长时间后再试一次
        if (!this.state.address) {
          console.log(
            "[TrustWalletAdapter] First attempt failed, waiting 3 seconds for retry..."
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // 检查是否通过事件获取到了地址
          if (!this.state.address) {
            console.log(
              "[TrustWalletAdapter] Retrying get_accounts after delay..."
            );
            await this.getTrustWalletAccounts();
          } else {
            console.log(
              "[TrustWalletAdapter] Address found through events during delay:",
              this.state.address
            );
          }
        }
      }

      // 关闭 wallet selector 的 modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Connection failed";
      this.state.isConnecting = false;

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.error("[TrustWalletAdapter] Connection failed:", error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    try {
      if (this.universalProvider && this.session) {
        await this.universalProvider.disconnect();
      }

      // 清理状态
      this.handleSessionDelete();

      // 关闭 Modal
      if (this.walletConnectModal) {
        this.walletConnectModal.closeModal();
      }

      console.log("[TrustWalletAdapter] Disconnected successfully");
    } catch (error) {
      console.error("[TrustWalletAdapter] Disconnect failed:", error);
      // 即使断开失败，也清理本地状态
      this.handleSessionDelete();
    }
  }

  /**
   * 签名并发送交易
   */
  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (!this.state.isConnected || !this.universalProvider || !this.session) {
      throw new Error(TRUST_WALLET_CONSTANTS.ERRORS.NO_SESSION);
    }

    try {
      // 序列化交易
      const serializedTx = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // 构建请求参数
      const params = {
        transaction: Buffer.from(serializedTx).toString("base64"),
      };

      // 发送签名并发送交易请求
      const result = await this.universalProvider.request(
        {
          method: "solana_signAndSendTransaction",
          params: params,
        },
        "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
      );

      if (typeof result === "string") {
        console.log(
          "[TrustWalletAdapter] Transaction sent successfully:",
          result
        );
        return result;
      } else if (
        result &&
        typeof result === "object" &&
        "signature" in result
      ) {
        return (result as { signature: string }).signature;
      } else {
        throw new Error("Invalid transaction response format");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Transaction failed";
      this.state.error = errorMessage;
      console.error("[TrustWalletAdapter] Transaction failed:", error);
      throw new Error(errorMessage);
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    const connected = this.state.isConnected;
    console.log(
      `[TrustWalletAdapter] isConnected() returning: ${connected}, address: ${this.state.address}`
    );
    return connected;
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string | null {
    const publicKey = this.state.address || null;
    console.log(`[TrustWalletAdapter] getPublicKey() returning: ${publicKey}`);
    return publicKey;
  }

  /**
   * 处理回调 (主要用于兼容现有接口)
   */
  async handleCallback(
    params: WalletCallbackRequest
  ): Promise<WalletCallbackResponse> {
    try {
      // WalletConnect 通过事件处理回调，这里主要用于兼容
      if (params.type === "connect" && this.state.isConnected) {
        return {
          type: "connect",
          success: true,
          data: { address: this.state.address },
        };
      } else if (params.type === "transaction" && params.signature) {
        return {
          type: "transaction",
          success: true,
          data: { signature: params.signature },
        };
      }

      return {
        type: params.type || "unknown",
        success: false,
        error: "Unknown callback type or invalid state",
      };
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
   * 保存会话到本地存储
   */
  private saveSession(): void {
    try {
      if (this.session) {
        localStorage.setItem(
          TRUST_WALLET_SESSION_KEY,
          JSON.stringify(this.session)
        );
        console.log("[TrustWalletAdapter] Session saved:", {
          topic: this.session.topic,
          accounts: this.session.accounts,
        });
      }

      const stateToSave = {
        isConnected: this.state.isConnected,
        address: this.state.address,
        wcSession: this.state.wcSession, // 保存完整的 WalletConnect 会话
      };

      localStorage.setItem(TRUST_WALLET_STATE_KEY, JSON.stringify(stateToSave));

      console.log("[TrustWalletAdapter] State saved:", {
        isConnected: stateToSave.isConnected,
        address: stateToSave.address,
        hasWcSession: !!stateToSave.wcSession,
      });
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to save session:", error);
    }
  }

  /**
   * 从本地存储恢复会话
   */
  private restoreSession(): void {
    try {
      const sessionData = localStorage.getItem(TRUST_WALLET_SESSION_KEY);
      const stateData = localStorage.getItem(TRUST_WALLET_STATE_KEY);

      if (sessionData && stateData) {
        this.session = JSON.parse(sessionData);
        const savedState = JSON.parse(stateData);

        this.state = {
          ...this.state,
          isConnected: savedState.isConnected,
          address: savedState.address,
          wcSession: savedState.wcSession, // 恢复完整的 WalletConnect 会话
        };

        console.log("[TrustWalletAdapter] Session restored from storage:", {
          isConnected: savedState.isConnected,
          address: savedState.address,
          hasWcSession: !!savedState.wcSession,
          sessionTopic: this.session?.topic,
        });

        // 如果有保存的会话，尝试重新连接到 WalletConnect
        if (savedState.isConnected && this.session) {
          this.reconnectToSession();
        }
      }
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to restore session:", error);
      this.clearSession();
    }
  }

  /**
   * 重新连接到已保存的 WalletConnect 会话
   */
  private async reconnectToSession(): Promise<void> {
    try {
      if (!this.session) {
        return;
      }

      console.log("[TrustWalletAdapter] Attempting to reconnect to session...");

      // 初始化 Provider (如果尚未初始化)
      await this.initializeProvider();

      if (!this.universalProvider) {
        throw new Error("Failed to initialize Universal Provider");
      }

      // 检查会话是否仍然存在于 UniversalProvider 中
      // UniversalProvider.session 是一个单一的会话对象，如果存在的话
      if (
        this.universalProvider.session &&
        this.universalProvider.session.topic === this.session.topic
      ) {
        // 会话仍然有效，更新状态
        console.log(
          "[TrustWalletAdapter] Existing session found, reconnecting..."
        );
        this.handleSessionConnect(this.universalProvider.session);
      } else {
        // 会话可能需要时间恢复，或者 UniversalProvider 的 session 属性在初始化时为空
        // 不要立即清理，而是保持当前状态，让用户可以尝试重新连接
        console.log(
          "[TrustWalletAdapter] No active session in provider, but keeping local state"
        );
        console.log(
          "[TrustWalletAdapter] Current address from restored state:",
          this.state.address
        );

        // 如果我们有保存的地址，保持连接状态
        if (this.state.address) {
          console.log(
            "[TrustWalletAdapter] Keeping connection state with saved address"
          );
          // 状态已经在 restoreSession 中恢复，不需要额外操作
        } else {
          // 如果没有地址，清理连接状态
          console.log(
            "[TrustWalletAdapter] No saved address, clearing connection state"
          );
          this.handleSessionDelete();
        }
      }
    } catch (error) {
      console.warn(
        "[TrustWalletAdapter] Failed to reconnect to session:",
        error
      );
      // 连接失败，但如果有保存的地址，保持连接状态让用户可以重试
      if (this.state.address) {
        console.log(
          "[TrustWalletAdapter] Keeping connection state despite reconnection error"
        );
      } else {
        this.handleSessionDelete();
      }
    }
  }

  /**
   * 清理会话存储
   */
  private clearSession(): void {
    try {
      localStorage.removeItem(TRUST_WALLET_SESSION_KEY);
      localStorage.removeItem(TRUST_WALLET_STATE_KEY);
    } catch (error) {
      console.warn("[TrustWalletAdapter] Failed to clear session:", error);
    }
  }

  /**
   * 手动尝试重新连接到保存的会话（用于调试和恢复）
   */
  async tryReconnect(): Promise<void> {
    console.log("[TrustWalletAdapter] Manual reconnection attempt...");

    // 如果已经连接，不需要重新连接
    if (this.state.isConnected) {
      console.log(
        "[TrustWalletAdapter] Already connected, skipping reconnection"
      );
      return;
    }

    // 尝试从本地存储恢复并重新连接
    await this.reconnectToSession();
  }

  /**
   * 手动刷新账户信息（用于调试和恢复）
   */
  async refreshAccounts(): Promise<void> {
    console.log("[TrustWalletAdapter] Manual accounts refresh...");

    if (!this.state.isConnected) {
      throw new Error("Wallet not connected");
    }

    await this.getTrustWalletAccounts();
  }
}
