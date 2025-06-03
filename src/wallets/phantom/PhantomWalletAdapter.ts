import type { WalletAdapter } from "@/wallets/types/wallet";
import * as nacl from "tweetnacl";
import type { Transaction } from "@solana/web3.js";
import { openPhantomSignAndSendTransactionDeeplink } from "@/wallets/utils/phantom";
import { generateDeeplink } from "@/wallets/utils/deeplink";
import { processConnectCallback } from "@/wallets/utils/callbacks";
import bs58 from "bs58";

export class PhantomWalletAdapter implements WalletAdapter {
  private _publicKey: string | null = null;
  private _connected: boolean = false;
  public dappKeyPair: nacl.BoxKeyPair | null = null;
  private phantomEncryptionPublicKey: string | null = null;
  private session: string | null = null;

  async connect(): Promise<void> {
    // 生成 dappKeyPair
    this.dappKeyPair = nacl.box.keyPair();

    // 生成重定向链接
    const redirectLink = encodeURIComponent(window.location.href);

    // 生成 deeplink
    const deeplink = generateDeeplink({
      baseUrl: "https://phantom.app/ul/v1/connect",
      params: {
        app_url: encodeURIComponent(window.location.origin),
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        redirect_link: redirectLink,
      },
    });

    // 打开 deeplink
    window.location.href = deeplink;
  }

  async disconnect(): Promise<void> {
    this._publicKey = null;
    this._connected = false;
    this.dappKeyPair = null;
    this.phantomEncryptionPublicKey = null;
    this.session = null;

    // 清除本地存储
    localStorage.removeItem("phantom_public_key");
    localStorage.removeItem("phantom_encryption_public_key");
    localStorage.removeItem("phantom_session");
  }

  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    if (
      !this.phantomEncryptionPublicKey ||
      !this.session ||
      !this.dappKeyPair
    ) {
      throw new Error("Wallet not connected");
    }

    const redirectUrl = `${window.location.origin}${window.location.pathname}`;
    return openPhantomSignAndSendTransactionDeeplink(
      transaction,
      redirectUrl,
      this.phantomEncryptionPublicKey,
      this.dappKeyPair,
      this.session
    );
  }

  // 处理连接回调
  handleConnectCallback(
    phantomPk: string,
    nonce: string,
    data: string
  ): boolean {
    const result = processConnectCallback(
      phantomPk,
      nonce,
      data,
      this.dappKeyPair
    );
    if (result) {
      this._publicKey = result.publicKey;
      this.phantomEncryptionPublicKey = phantomPk;
      this.session = result.session;
      this._connected = true;
      return true;
    }
    return false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  getPublicKey(): string | null {
    return this._publicKey;
  }
}
