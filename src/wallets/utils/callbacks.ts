import * as nacl from "tweetnacl";
import bs58 from "bs58";

export function processConnectCallback(
  phantomPk: string,
  nonce: string,
  data: string,
  dappKeyPair: nacl.BoxKeyPair | null
): { publicKey: string; session: string } | null {
  if (!dappKeyPair) return null;

  try {
    const sharedSecret = nacl.box.before(
      bs58.decode(phantomPk),
      dappKeyPair.secretKey
    );

    const decodedData = bs58.decode(data);
    const decodedNonce = bs58.decode(nonce);

    const decryptedData = nacl.box.open.after(
      decodedData,
      decodedNonce,
      sharedSecret
    );

    if (!decryptedData) return null;

    const { public_key, session } = JSON.parse(
      new TextDecoder().decode(decryptedData)
    );

    return { publicKey: public_key, session };
  } catch (error) {
    console.error("Error processing connect callback:", error);
    return null;
  }
}
