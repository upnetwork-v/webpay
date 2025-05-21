export const handleTransactionResponse = (
  urlParams: URLSearchParams,
  processTransaction: (
    data: string,
    nonce: string
  ) => Promise<{ signature: string } | null>,
  onSuccess: (signature: string) => void,
  onError: (error: string) => void
) => {
  // Handle Phantom deeplink redirect
  console.log("URL params:", Object.fromEntries(urlParams.entries()));

  // Check for direct signature (legacy)
  if (urlParams.get("signature")) {
    const signature = urlParams.get("signature");
    if (signature) {
      onSuccess(signature);
    }
    return { shouldCleanUrl: true };
  }

  // Check for encrypted transaction data
  const data = urlParams.get("data");
  const nonce = urlParams.get("nonce");

  if (data && nonce) {
    // Process the transaction asynchronously
    processTransaction(data, nonce)
      .then((result) => {
        if (result?.signature) {
          onSuccess(result.signature);
        }
      })
      .catch((err) => {
        console.error("Error processing transaction:", err);
        onError("Failed to process transaction");
      });

    return { shouldCleanUrl: true };
  }

  // Handle error cases
  if (urlParams.get("errorCode")) {
    const errorCode = urlParams.get("errorCode");
    const errorMessage = urlParams.get("errorMessage") || "Payment failed";

    console.log("Payment error:", { errorCode, errorMessage });

    if (errorCode === "-32603") {
      onError(
        `Phantom wallet error (${errorCode}): Please make sure your wallet is connected to Solana Devnet and has enough SOL for the transaction and fees.\n\nOriginal error: ${errorMessage}`
      );
    } else {
      onError(errorMessage);
    }

    return { shouldCleanUrl: true };
  }

  return { shouldCleanUrl: false };
};

export const savePendingTransaction = (data: string, nonce: string) => {
  sessionStorage.setItem("pendingTxData", data);
  sessionStorage.setItem("pendingTxNonce", nonce);
};

export const clearPendingTransaction = () => {
  sessionStorage.removeItem("pendingTxData");
  sessionStorage.removeItem("pendingTxNonce");
};

export const getPendingTransaction = () => {
  const data = sessionStorage.getItem("pendingTxData");
  const nonce = sessionStorage.getItem("pendingTxNonce");
  return data && nonce ? { data, nonce } : null;
};
