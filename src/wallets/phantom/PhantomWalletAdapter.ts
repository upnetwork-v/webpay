import { PublicKey, Transaction } from "@solana/web3.js";
import { BaseWalletAdapter } from "../BaseWalletAdapter";
import type {
  WalletAdapter,
  WalletConnectionResult,
  SendOptions,
} from "../types";
import { WalletType, WalletError } from "../types";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  decryptPhantomPayload,
  openPhantomSignAndSendTransactionDeeplink,
  decryptTransactionResponse,
} from "@/utils/phantom";

// 定义 Phantom 钱包提供者接口
interface PhantomProvider {
  connect(params?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: string }>;
  disconnect(): Promise<void>;
  signTransaction(transaction: Transaction): Promise<Transaction>;
  signAllTransactions(transactions: Transaction[]): Promise<Transaction[]>;
  signAndSendTransaction(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<{ signature: string }>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  isConnected: boolean;
  isPhantom: boolean;
  publicKey: PublicKey;
}

// 定义 Deeplink 结果接口
interface DeeplinkResult {
  publicKey?: string;
  signature?: string;
  session?: string;
  error?: string;
}

// 全局类型定义
declare global {
  interface Window {
    phantom?: {
      solana: PhantomProvider;
    };
  }
}

export class PhantomWalletAdapter
  extends BaseWalletAdapter
  implements WalletAdapter
{
  readonly name = "Phantom";
  readonly icon = "https://phantom.app/favicon.ico";
  readonly type = WalletType.Phantom;

  readonly downloadUrl = {
    android: "https://play.google.com/store/apps/details?id=app.phantom",
    ios: "https://apps.apple.com/us/app/phantom-crypto-wallet/id1598432977",
    chrome:
      "https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa",
  };

  private _provider: PhantomProvider | null = null;
  private _deeplinkHandlers: Map<string, (params: DeeplinkResult) => void> =
    new Map();
  private _dappKeyPair: nacl.BoxKeyPair | null = null;

  private async _initProvider(): Promise<void> {
    // 尝试获取 Phantom 钱包提供者
    if (typeof window !== "undefined" && window.phantom?.solana) {
      this._provider = window.phantom.solana;
    }
  }

  constructor() {
    super();
    this._setupDeeplinkHandlers();
    this._initProvider();
  }

  isInstalled(): boolean {
    return !!window.phantom?.solana?.isPhantom;
  }

  isSupported(): boolean {
    return this.isInstalled() || this._isMobile();
  }

  supportsDeeplink(): boolean {
    return true;
  }

  private _getOrCreateDappKeyPair(): nacl.BoxKeyPair {
    // 兼容 usePhantomWallet 的本地存储逻辑
    const pk = localStorage.getItem("dapp_pk");
    const sk = localStorage.getItem("dapp_sk");
    let keypair: nacl.BoxKeyPair;
    if (pk && sk) {
      keypair = {
        publicKey: bs58.decode(pk),
        secretKey: bs58.decode(sk),
      };
    } else {
      keypair = nacl.box.keyPair();
      localStorage.setItem("dapp_pk", bs58.encode(keypair.publicKey));
      localStorage.setItem("dapp_sk", bs58.encode(keypair.secretKey));
    }
    this._dappKeyPair = keypair;
    return keypair;
  }

  async connect(params?: {
    onlyIfTrusted?: boolean;
    returnURL?: string;
    cluster?: string;
  }): Promise<WalletConnectionResult> {
    try {
      // 移动端未安装 Phantom 时使用 Deeplink
      if (this._isMobile() && !this.isInstalled()) {
        // 生成或读取 dappKeyPair
        const dappKeyPair = this._getOrCreateDappKeyPair();
        const dapp_encryption_public_key = bs58.encode(dappKeyPair.publicKey);
        const app_url = window.location.origin;
        const currentUrl = window.location.href;
        const deeplink = this.generateDeeplink({
          action: "connect",
          params: {
            app_url,
            dapp_encryption_public_key,
            cluster: params?.cluster,
          },
          returnURL: params?.returnURL || currentUrl,
        });
        console.log("deeplink:connect", deeplink);
        window.location.href = deeplink;

        return new Promise((resolve, reject) => {
          const handler = (result: DeeplinkResult) => {
            if (result.publicKey) {
              const publicKey = new PublicKey(result.publicKey);
              this._publicKey = publicKey;
              this._connected = true;
              this._emit("connect", publicKey);

              resolve({
                publicKey,
                connected: true,
                walletName: this.name,
                session: result.session,
              });
            } else {
              reject(
                new WalletError(
                  4001,
                  result.error || "User rejected the request"
                )
              );
            }
            this._deeplinkHandlers.delete("connect");
          };

          this._deeplinkHandlers.set("connect", handler);

          // 设置超时
          setTimeout(() => {
            this._deeplinkHandlers.delete("connect");
            reject(new WalletError(4001, "Request timeout"));
          }, 30000); // 30秒超时
        });
      }

      // 桌面端或已安装移动端使用标准流程
      if (!this._provider) {
        throw new WalletError(4001, "Phantom wallet not installed");
      }

      const response = await this._provider.connect({
        onlyIfTrusted: params?.onlyIfTrusted || false,
      });

      const publicKey = new PublicKey(response.publicKey.toString());
      this._publicKey = publicKey;
      this._connected = true;
      this._emit("connect", publicKey);

      return {
        publicKey,
        connected: true,
        walletName: this.name,
      };
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }

  async disconnect(): Promise<void> {
    if (this._provider) {
      try {
        await this._provider.disconnect();
        this._publicKey = null;
        this._connected = false;
        this._emit("disconnect");
      } catch (error) {
        const err = error as { code?: number; message: string };
        throw new WalletError(err.code || 4000, err.message);
      }
    }
  }

  async signAndSendTransaction(
    transaction: Transaction,
    options?: SendOptions
  ): Promise<string> {
    if (this._isMobile() && !this.isInstalled()) {
      // 移动端未安装，使用官方加密 deeplink
      // 1. 获取 phantomEncryptionPublicKey、dappKeyPair、session
      const phantomEncryptionPublicKey = localStorage.getItem(
        "phantom_encryption_public_key"
      );
      const session = localStorage.getItem("phantom_session");
      const dappKeyPair = this._dappKeyPair || this._getOrCreateDappKeyPair();
      if (!phantomEncryptionPublicKey || !session || !dappKeyPair) {
        throw new WalletError(4001, "请先完成 Phantom 钱包连接");
      }
      // 2. 调用工具函数生成 deeplink 并跳转
      openPhantomSignAndSendTransactionDeeplink(
        transaction,
        window.location.href,
        phantomEncryptionPublicKey,
        dappKeyPair,
        session
      );
      // 3. 返回 Promise，监听回调
      return new Promise((resolve, reject) => {
        const handler = (result: DeeplinkResult) => {
          if (result.signature) {
            resolve(result.signature);
          } else {
            reject(
              new WalletError(4001, result.error || "User rejected the request")
            );
          }
          this._deeplinkHandlers.delete("signTransaction");
        };
        this._deeplinkHandlers.set("signTransaction", handler);
        setTimeout(() => {
          this._deeplinkHandlers.delete("signTransaction");
          reject(new WalletError(4001, "Request timeout"));
        }, 30000);
      });
    }
    // 桌面端或已安装移动端使用 SDK
    try {
      if (!this._provider) {
        throw new WalletError(4001, "Wallet not connected");
      }
      const { signature } = await this._provider.signAndSendTransaction(
        transaction,
        options
      );
      return signature;
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (this._isMobile() && !this.isInstalled()) {
      // 移动端未安装，使用 Deeplink
      const encodedMessage = Buffer.from(message).toString("base64");
      const deeplink = this.generateDeeplink({
        action: "signMessage",
        params: {
          message: encodedMessage,
          display: "touch",
        },
        returnURL: window.location.href,
      });

      window.location.href = deeplink;

      return new Promise((resolve, reject) => {
        const handler = (result: DeeplinkResult) => {
          if (result.signature) {
            resolve(Buffer.from(result.signature, "base64"));
          } else {
            reject(
              new WalletError(4001, result.error || "User rejected the request")
            );
          }
          this._deeplinkHandlers.delete("signMessage");
        };

        this._deeplinkHandlers.set("signMessage", handler);

        // 设置超时
        setTimeout(() => {
          this._deeplinkHandlers.delete("signMessage");
          reject(new WalletError(4001, "Request timeout"));
        }, 30000); // 30秒超时
      });
    }

    // 桌面端或已安装移动端使用标准流程
    try {
      if (!this._provider) {
        throw new WalletError(4001, "Wallet not connected");
      }

      const { signature } = await this._provider.signMessage(message);
      return signature;
    } catch (error) {
      const err = error as { code?: number; message: string };
      throw new WalletError(err.code || 4000, err.message);
    }
  }

  generateDeeplink(params: {
    action: "connect" | "signTransaction" | "signMessage";
    params: Record<string, unknown>;
    returnURL: string;
  }): string {
    if (params.action === "connect") {
      const useUniversalLinks = false;
      const baseUrl = `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/`;
      const p = params.params as {
        app_url: string;
        dapp_encryption_public_key: string;
        cluster?: string;
      };
      const urlParams = new URLSearchParams();
      urlParams.append("app_url", p.app_url);
      urlParams.append(
        "dapp_encryption_public_key",
        p.dapp_encryption_public_key
      );
      urlParams.append("redirect_link", params.returnURL);
      if (p.cluster) urlParams.append("cluster", p.cluster);
      return `${baseUrl}${params.action}?${urlParams.toString()}`;
    } else if (
      params.action === "signTransaction" ||
      params.action === "signMessage"
    ) {
      // 保持原有逻辑或抛错
      throw new Error(
        "signTransaction/signMessage deeplink not implemented in this adapter version"
      );
    } else {
      throw new Error("Unsupported deeplink action");
    }
  }

  async handleDeeplink(url: URL): Promise<void> {
    // 处理从 Deeplink 返回的响应
    const errorParam = url.searchParams.get("error");
    if (errorParam) {
      // 处理错误回调
      this._emit("error", new WalletError(4001, errorParam));
      return;
    }

    // 处理 Phantom connect 回调
    const phantomPk = url.searchParams.get("phantom_encryption_public_key");
    const nonce = url.searchParams.get("nonce");
    const data = url.searchParams.get("data");
    // connect 回调：phantom_encryption_public_key + nonce + data
    if (phantomPk && nonce && data) {
      try {
        const dappKeyPair = this._dappKeyPair || this._getOrCreateDappKeyPair();
        const decrypted = decryptPhantomPayload(
          phantomPk,
          nonce,
          data,
          dappKeyPair
        );
        // 保存 session、公钥等
        localStorage.setItem("phantom_encryption_public_key", phantomPk);
        localStorage.setItem("phantom_public_key", decrypted.public_key);
        localStorage.setItem("phantom_session", decrypted.session);
        this._publicKey = new PublicKey(decrypted.public_key);
        this._connected = true;
        // 触发 connect 事件
        this._emit("connect", this._publicKey);
      } catch (e) {
        this._emit("error", e);
      }
      return;
    }

    // 处理支付（signAndSendTransaction）回调
    // 1. 优先处理 signature 直接作为参数返回的情况
    if (url.searchParams.has("signature")) {
      const signature = url.searchParams.get("signature");
      const handler = this._deeplinkHandlers.get("signTransaction");
      if (handler && signature) {
        handler({ signature });
      } else if (signature) {
        // 直接触发事件（如有需要）
        this._emit("signTransaction", signature);
      }
      return;
    }
    // 2. 处理 nonce + data（加密 signature）
    if (nonce && data) {
      try {
        const phantomEncryptionPublicKey = localStorage.getItem(
          "phantom_encryption_public_key"
        );
        const dappKeyPair = this._dappKeyPair || this._getOrCreateDappKeyPair();
        if (!phantomEncryptionPublicKey || !dappKeyPair) {
          throw new WalletError(4001, "缺少解密所需的密钥");
        }
        // 解密 signature
        const decrypted = decryptTransactionResponse(
          phantomEncryptionPublicKey,
          nonce,
          data,
          dappKeyPair
        );
        if (decrypted.signature) {
          const handler = this._deeplinkHandlers.get("signTransaction");
          if (handler) {
            handler({ signature: decrypted.signature });
          } else {
            this._emit("signTransaction", decrypted.signature);
          }
        } else {
          throw new WalletError(4001, "未能解密出 signature");
        }
      } catch (e) {
        this._emit("error", e);
      }
      return;
    }

    // 处理消息签名响应（如有 signMessage 场景，可扩展）
    if (url.searchParams.has("signMessage")) {
      // 可根据需要扩展 signMessage 相关逻辑
    }
  }

  private _setupDeeplinkHandlers(): void {
    // 初始化时设置 Deeplink 处理器
    // 这里可以添加特定的处理逻辑
  }
}
