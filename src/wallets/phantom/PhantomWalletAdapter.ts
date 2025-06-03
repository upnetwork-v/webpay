import type { WalletAdapter } from "@/wallets/types/wallet";
import * as nacl from "tweetnacl";
import type { Transaction } from "@solana/web3.js";
import { openPhantomSignAndSendTransactionDeeplink } from "@/wallets/utils/phantom";
import { generateDeeplink } from "@/wallets/utils/deeplink";
import { processConnectCallback } from "@/wallets/utils/callbacks";
import bs58 from "bs58";

const DAPP_KEYPAIR_SESSION_KEY = "phantom_dapp_keypair";

function saveDappKeyPairToSession(dappKeyPair: nacl.BoxKeyPair) {
  localStorage.setItem(
    DAPP_KEYPAIR_SESSION_KEY,
    JSON.stringify({
      publicKey: bs58.encode(dappKeyPair.publicKey),
      secretKey: bs58.encode(dappKeyPair.secretKey),
    })
  );
}

function loadDappKeyPairFromSession(): nacl.BoxKeyPair | null {
  const raw = localStorage.getItem(DAPP_KEYPAIR_SESSION_KEY);
  if (!raw) return null;
  try {
    const { publicKey, secretKey } = JSON.parse(raw);
    return {
      publicKey: bs58.decode(publicKey),
      secretKey: bs58.decode(secretKey),
    } as nacl.BoxKeyPair;
  } catch {
    return null;
  }
}

function clearDappKeyPairFromSession() {
  localStorage.removeItem(DAPP_KEYPAIR_SESSION_KEY);
}

export class PhantomWalletAdapter implements WalletAdapter {
  private _publicKey: string | null = null;
  private _connected: boolean = false;
  public dappKeyPair: nacl.BoxKeyPair | null;
  private phantomEncryptionPublicKey: string | null = null;
  private session: string | null = null;

  constructor() {
    this.dappKeyPair = loadDappKeyPairFromSession();
  }

  async connect(): Promise<void> {
    // 生成 dappKeyPair
    this.dappKeyPair = nacl.box.keyPair();
    saveDappKeyPairToSession(this.dappKeyPair);

    // 生成重定向链接
    const redirectLink = window.location.href;

    // 生成 deeplink
    const deeplink = generateDeeplink({
      baseUrl: "https://phantom.app/ul/v1/connect",
      params: {
        app_url: window.location.origin,
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
    clearDappKeyPairFromSession();
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
    // dappKeyPair 已在构造函数自动恢复，无需再判断
    console.log("handleConnectCallback 2", phantomPk, nonce, data);
    console.log("dappKeyPair", this.dappKeyPair);
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
      clearDappKeyPairFromSession(); // 用完后清理
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
