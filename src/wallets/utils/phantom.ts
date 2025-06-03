import * as nacl from "tweetnacl";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { generateDeeplink } from "./deeplink";

export function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectUrl: string,
  phantomEncryptionPublicKey: string,
  dappKeyPair: nacl.BoxKeyPair,
  session: string
): Promise<string> {
  // 序列化交易
  const serializedTransaction = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  // 创建加密载荷
  const payload = {
    transaction: bs58.encode(serializedTransaction),
    session,
    redirect: redirectUrl,
  };

  const nonce = nacl.randomBytes(24);
  const sharedSecret = nacl.box.before(
    bs58.decode(phantomEncryptionPublicKey),
    dappKeyPair.secretKey
  );

  const encryptedPayload = nacl.box.after(
    new TextEncoder().encode(JSON.stringify(payload)),
    nonce,
    sharedSecret
  );

  // 生成 deeplink
  const deeplink = generateDeeplink({
    baseUrl: "https://phantom.app/ul/v1/signAndSendTransaction",
    params: {
      nonce: bs58.encode(nonce),
      data: bs58.encode(encryptedPayload),
    },
  });

  // 打开 deeplink
  window.location.href = deeplink;

  // 返回一个永远不会解析的 Promise（因为页面会重定向）
  return new Promise(() => {});
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
