// src/utils/phantom.ts
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decode as decodeUTF8 } from "@stablelib/utf8";

export const DAPP_URL = window.location.origin;
export const SOLANA_NETWORK = "devnet";

export function getRedirectAfterTransactionUrl(orderId: string): string {
  return `${DAPP_URL}/payment/${orderId}?deeplink=1`;
}

const useUniversalLinks = false;
const buildUrl = (path: string, params: URLSearchParams) =>
  `${useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"}v1/${path}?${params.toString()}`;

export function openPhantomSignAndSendTransactionDeeplink(
  transaction: Transaction,
  redirectLink: string
) {
  try {
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
    const deeplinkUrl = buildUrl("signAndSendTransaction", params);
    console.log("Opening Phantom deeplink");
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
      app_url: encodeURIComponent(window.location.origin),
      redirect_link: encodeURIComponent(redirectUrl),
      dapp_encryption_public_key: dappPublicKey,
      cluster: SOLANA_NETWORK,
    })
  );
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
