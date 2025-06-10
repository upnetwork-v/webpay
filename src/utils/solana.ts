import nacl from "tweetnacl";
import bs58 from "bs58";

export const SOLANA_NETWORK = "mainnet-beta"; //"devnet";

export function isValidSolanaTxHash(signature: string): boolean {
  if (typeof signature !== "string") return false;
  // Solana signature base58 编码后通常为 87-88 字符
  if (signature.length < 87 || signature.length > 88) return false;
  try {
    const decoded = bs58.decode(signature);
    // Ed25519 签名原始字节长度为 64
    return decoded.length === 64;
  } catch {
    return false;
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
