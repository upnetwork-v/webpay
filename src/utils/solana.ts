import nacl from "tweetnacl";

export const SOLANA_NETWORK = "mainnet-beta"; //"devnet";

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
