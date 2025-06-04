// src/utils/phantom.ts
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decode as decodeUTF8 } from "@stablelib/utf8";

export const SOLANA_NETWORK = "mainnet-beta"; //"devnet";

const useUniversalLinks = false;

export const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

/**
 * Encrypts a payload using the shared secret between the dapp and Phantom
 * @param payload - The payload to encrypt
 * @param sharedSecret - The shared secret between the dapp and Phantom
 * @returns [nonce, encryptedPayload] - The nonce and encrypted payload
 */
export function encryptPayload(
  payload: any,
  sharedSecret: Uint8Array
): [Uint8Array, Uint8Array] {
  // Generate a random nonce
  const nonce = nacl.randomBytes(24);

  // Convert payload to Uint8Array for encryption
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(JSON.stringify(payload));

  // Encrypt the payload using the shared secret
  const encryptedPayload = nacl.box.after(payloadBytes, nonce, sharedSecret);

  return [nonce, encryptedPayload];
}

/**
 * Opens a Phantom deeplink to sign and send a transaction according to the official Phantom documentation
 * @param transaction - The transaction to be signed and sent
 * @param redirectLink - Where to redirect after completion
 * @param phantomEncryptionPublicKey - The phantom encryption public key received during connection
 * @param dappKeyPair - The dapp key pair used for encryption
 * @param session - Session token received from connect method
 */
export function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectLink: string,
  phantomEncryptionPublicKey: string,
  dappKeyPair: nacl.BoxKeyPair,
  session: string
) {
  try {
    // Log transaction details before serialization
    console.log("Transaction details before serialization:", {
      feePayer: transaction.feePayer?.toBase58(),
      recentBlockhash: transaction.recentBlockhash,
      instructions: transaction.instructions.map((ins) => ({
        programId: ins.programId.toBase58(),
        keys: ins.keys.length,
      })),
    });

    // Ensure the transaction is fully valid before serialization
    if (!transaction.recentBlockhash) {
      throw new Error("Transaction is missing recentBlockhash");
    }

    if (!transaction.feePayer) {
      throw new Error("Transaction is missing feePayer");
    }

    // Validate required parameters
    if (!phantomEncryptionPublicKey) {
      throw new Error("Missing required parameter: phantomEncryptionPublicKey");
    }

    if (!dappKeyPair) {
      throw new Error("Missing required parameter: dappKeyPair");
    }

    if (!session) {
      throw new Error(
        "Missing required parameter: session. Must connect wallet first."
      );
    }

    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    // Create the payload object according to Phantom's official demo
    const payload = {
      session,
      transaction: bs58.encode(serializedTransaction),
    };

    // Calculate shared secret from phantom public key and dapp secret key
    const phantomPubKeyBytes = bs58.decode(phantomEncryptionPublicKey);
    const sharedSecret = nacl.box.before(
      phantomPubKeyBytes,
      dappKeyPair.secretKey
    );

    // Encrypt the payload using the shared secret
    const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);

    // Create params according to Phantom docs
    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: redirectLink, // 使用没有查询参数的URL
      payload: bs58.encode(encryptedPayload),
    });

    const deeplinkUrl = buildUrl("signAndSendTransaction", params);
    console.log("Opening Phantom signAndSendTransaction deeplink", deeplinkUrl);

    // 使用替代方法打开deeplink
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      // 在移动设备上，使用window.location.href
      window.location.href = deeplinkUrl;
    } else {
      // 在桌面上，创建隐藏的a标签并模拟点击
      const link = document.createElement("a");
      link.href = deeplinkUrl;
      link.target = "_self"; // 确保在同一个标签页中打开
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error("Error creating deeplink:", error);
    throw error;
  }
}

export function openPhantomConnectDeeplink(dappPublicKey: string) {
  // 使用当前URL作为重定向URL，而不是通用路径
  const currentUrl = window.location.href;
  // 去除URL中的查询参数，保留路径
  const baseUrl = currentUrl.split("?")[0];

  console.log("Current URL:", currentUrl);
  console.log("Base URL for redirect:", baseUrl);

  const deeplinkUrl = buildUrl(
    "connect",
    new URLSearchParams({
      dapp_encryption_public_key: dappPublicKey,
      cluster: SOLANA_NETWORK,
      app_url: baseUrl,
      redirect_link: currentUrl, // 使用精确的当前URL作为重定向目标
    })
  );
  console.log("Opening connect deeplink:", deeplinkUrl);

  // 使用替代方法打开deeplink
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    // 在移动设备上，使用window.location.href
    window.location.href = deeplinkUrl;
  } else {
    // 在桌面上，创建隐藏的a标签并模拟点击
    const link = document.createElement("a");
    link.href = deeplinkUrl;
    link.target = "_self"; // 确保在同一个标签页中打开
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Decrypts payload received from Phantom wallet
 * @param phantomPublicKey - Phantom encryption public key
 * @param nonce - Nonce used for encryption
 * @param data - Encrypted data
 * @param dappKeyPair - Dapp key pair used for decryption
 * @returns Object containing public_key and session from Phantom
 */
export function decryptPhantomPayload(
  phantomPublicKey: string,
  nonce: string,
  data: string,
  dappKeyPair: nacl.BoxKeyPair
): { public_key: string; session: string } {
  const phantomPublicKeyBytes = bs58.decode(phantomPublicKey);
  const sharedSecret = nacl.box.before(
    phantomPublicKeyBytes,
    dappKeyPair.secretKey
  );
  const decrypted = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );
  if (!decrypted) throw new Error("Failed to decrypt Phantom payload");
  const payload = JSON.parse(decodeUTF8(decrypted));
  // 确保payload包含必要的字段
  if (!payload.public_key || !payload.session) {
    console.error("Invalid Phantom payload:", payload);
    throw new Error("Phantom payload missing required fields");
  }
  return {
    public_key: payload.public_key,
    session: payload.session,
  };
}

/**
 * 解密交易响应数据
 * @param phantomEncryptionPublicKey - Phantom 加密公钥
 * @param nonce - 加密使用的 nonce
 * @param data - 加密的响应数据
 * @param dappKeyPair - 应用密钥对
 * @returns 解密后的数据，包含 signature
 */
export function decryptTransactionResponse(
  phantomEncryptionPublicKey: string,
  nonce: string,
  data: string,
  dappKeyPair: nacl.BoxKeyPair
): { signature: string } {
  try {
    console.log("Decrypting transaction response with:", {
      phantomPkLength: phantomEncryptionPublicKey.length,
      nonceLength: nonce.length,
      dataLength: data.length,
    });

    // 计算共享密钥
    const phantomPublicKeyBytes = bs58.decode(phantomEncryptionPublicKey);
    console.log(
      "Decoded phantom public key length:",
      phantomPublicKeyBytes.length
    );

    const sharedSecret = nacl.box.before(
      phantomPublicKeyBytes,
      dappKeyPair.secretKey
    );
    console.log("Shared secret calculated");

    // 解码 nonce 和 data
    let nonceBytes: Uint8Array;
    let dataBytes: Uint8Array;

    try {
      nonceBytes = bs58.decode(nonce);
      console.log("Nonce decoded, length:", nonceBytes.length);
    } catch (e) {
      console.error("Failed to decode nonce:", e);
      throw new Error("Invalid nonce format");
    }

    try {
      dataBytes = bs58.decode(data);
      console.log("Data decoded, length:", dataBytes.length);
    } catch (e) {
      console.error("Failed to decode data:", e);
      throw new Error("Invalid data format");
    }

    // 检查 nonce 长度
    if (nonceBytes.length !== 24) {
      console.warn(`Unusual nonce length: ${nonceBytes.length}, expected 24`);
    }

    // 解密数据
    const decrypted = nacl.box.open.after(dataBytes, nonceBytes, sharedSecret);

    if (!decrypted) {
      throw new Error("Failed to decrypt transaction response - null result");
    }

    console.log("Data decrypted successfully, length:", decrypted.length);

    // 解析解密后的数据
    let payload: any;

    try {
      const jsonText = decodeUTF8(decrypted);
      console.log("Decrypted JSON text:", jsonText);
      payload = JSON.parse(jsonText);
    } catch (e) {
      console.error("Failed to parse decrypted JSON:", e);
      throw new Error("Invalid JSON in decrypted data");
    }

    console.log("Parsed payload:", payload);

    // 检查签名
    if (!payload.signature) {
      console.warn("Payload missing signature:", payload);
      // 如果找不到signature字段，尝试查找其他可能的字段名
      if (payload.tx || payload.txid || payload.txHash || payload.hash) {
        return {
          signature:
            payload.tx || payload.txid || payload.txHash || payload.hash,
        };
      }
      throw new Error("Transaction response missing signature");
    }

    return { signature: payload.signature };
  } catch (error) {
    console.error("Error in decryptTransactionResponse:", error);
    throw error;
  }
}

/**
 * 生成 Solana Explorer 交易 URL
 * @param signature - 交易签名
 * @returns Solana Explorer URL
 */
export function getSolanaExplorerUrl(signature: string): string {
  const networkParam =
    SOLANA_NETWORK === ("mainnet-beta" as string)
      ? ""
      : `?cluster=${SOLANA_NETWORK}`;
  return `https://explorer.solana.com/tx/${signature}${networkParam}`;
}
