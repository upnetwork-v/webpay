// src/utils/phantom.ts
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decode as decodeUTF8 } from "@stablelib/utf8";

export const SOLANA_NETWORK = "devnet";

const useUniversalLinks = false;

export const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

/**
 * Encrypts a payload using the shared secret between the dapp and Phantom
 * @param payload - The payload to encrypt
 * @param sharedSecret - The shared secret between the dapp and Phantom
 * @returns [nonce, encryptedPayload] - The nonce and encrypted payload
 */
export function encryptPayload(payload: any, sharedSecret: Uint8Array): [Uint8Array, Uint8Array] {
  // Generate a random nonce
  const nonce = nacl.randomBytes(24);
  
  // Convert payload to Uint8Array for encryption
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  
  // Encrypt the payload using the shared secret
  const encryptedPayload = nacl.box.after(
    payloadBytes,
    nonce,
    sharedSecret
  );
  
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
    
    // Validate required parameters
    if (!phantomEncryptionPublicKey) {
      throw new Error("Missing required parameter: phantomEncryptionPublicKey");
    }
    
    if (!dappKeyPair) {
      throw new Error("Missing required parameter: dappKeyPair");
    }
    
    if (!session) {
      throw new Error("Missing required parameter: session. Must connect wallet first.");
    }
    
    // Serialize the transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    
    // Create the payload object according to Phantom's official demo
    const payload = {
      session,
      transaction: bs58.encode(serializedTransaction)
    };
    
    // Calculate shared secret from phantom public key and dapp secret key
    const phantomPubKeyBytes = bs58.decode(phantomEncryptionPublicKey);
    const sharedSecret = nacl.box.before(phantomPubKeyBytes, dappKeyPair.secretKey);
    
    // Encrypt the payload using the shared secret
    const [nonce, encryptedPayload] = encryptPayload(payload, sharedSecret);
    
    // Create params according to Phantom docs
    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: redirectLink,
      payload: bs58.encode(encryptedPayload)
    });
    
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
    session: payload.session
  };
}
