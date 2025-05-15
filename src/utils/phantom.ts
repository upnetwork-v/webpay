// src/utils/phantom.ts
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decode as decodeUTF8 } from "@stablelib/utf8";

export const SOLANA_NETWORK = "devnet";

const useUniversalLinks = false;

export const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

export function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectLink: string
) {
  try {
    // Log transaction details before serialization
    console.log("Transaction details before serialization:", {
      feePayer: transaction.feePayer?.toBase58(),
      recentBlockhash: transaction.recentBlockhash,
      instructions: transaction.instructions.map(ins => ({
        programId: ins.programId.toBase58(),
        keys: ins.keys.length
      }))
    });
    
    // Ensure the transaction is fully valid before serialization
    if (!transaction.recentBlockhash) {
      throw new Error("Transaction is missing recentBlockhash");
    }
    
    if (!transaction.feePayer) {
      throw new Error("Transaction is missing feePayer");
    }
    
    const serialized = bs58.encode(
      transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
    );
    console.log("Transaction serialized successfully");
    
    const params = new URLSearchParams({
      transaction: serialized,
      redirect_link: redirectLink,
    });
    
    // Add additional Phantom parameters for better error handling
    params.append("app_url", window.location.origin);
    params.append("cluster", SOLANA_NETWORK);
    
    const deeplinkUrl = buildUrl("signAndSendTransaction", params);
    console.log("Opening Phantom deeplink", deeplinkUrl);
    console.log("Redirect link set to:", redirectLink);
    
    window.location.href = deeplinkUrl;
  } catch (error) {
    console.error("Error creating deeplink:", error);
    throw error;
  }
}

export function openPhantomConnectDeeplink(dappPublicKey: string) {
  const redirectUrl = `${window.location.origin}${window.location.pathname}`;
  const deeplinkUrl = buildUrl(
    "connect",
    new URLSearchParams({
      dapp_encryption_public_key: dappPublicKey,
      cluster: SOLANA_NETWORK,
      app_url: redirectUrl,
      redirect_link: redirectUrl,
    })
  );
  console.log(deeplinkUrl);

  window.location.href = deeplinkUrl;
}

export function decryptPhantomPayload(
  phantomPublicKey: string,
  nonce: string,
  data: string,
  dappKeyPair: nacl.BoxKeyPair
): string {
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
  return payload.public_key;
}
