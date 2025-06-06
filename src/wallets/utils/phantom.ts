import * as nacl from "tweetnacl";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { encryptPayload } from "@/utils";

const useUniversalLinks = false;

export const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

export function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectLink: string,
  phantomEncryptionPublicKey: string,
  dappKeyPair: nacl.BoxKeyPair,
  session: string
): string {
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
    console.log("Opening Phantom deeplink", deeplinkUrl);

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
    return deeplinkUrl;
  } catch (error) {
    console.error("Error creating deeplink:", error);
    throw error;
  }
}

export function decryptTransactionResponse(
  phantomEncryptionPublicKey: string,
  nonce: string,
  data: string,
  dappKeyPair: nacl.BoxKeyPair
): { signature: string } {
  const sharedSecret = nacl.box.before(
    bs58.decode(phantomEncryptionPublicKey),
    dappKeyPair.secretKey
  );

  const decryptedData = nacl.box.open.after(
    bs58.decode(data),
    bs58.decode(nonce),
    sharedSecret
  );

  if (!decryptedData) {
    throw new Error("Failed to decrypt transaction response");
  }

  const response = JSON.parse(new TextDecoder().decode(decryptedData));
  return { signature: response.signature };
}
