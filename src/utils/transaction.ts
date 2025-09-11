import {
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { TransactionParams } from "@/types/payment";

const connection = new Connection(import.meta.env.VITE_SOLANA_RPC);

// Helper to create a Memo instruction
function createMemoInstruction(
  memo: string,
  signer: PublicKey
): TransactionInstruction {
  console.log("原始 memo 数据:", memo);
  const encodedData = new TextEncoder().encode(memo);
  console.log("编码后的 memo 数据:", encodedData);
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: encodedData as Buffer,
  });
}

export async function createSPLTransferTransaction({
  from,
  to,
  tokenAmount,
  tokenAddress,
  orderId,
}: TransactionParams): Promise<Transaction> {
  try {
    if (!tokenAddress) {
      throw new Error("Token address is required for SPL token payment");
    }

    console.log("Creating transaction with params:", {
      from: from.toString(),
      to: to.toString(),
      tokenAddress: tokenAddress.toString(),
      tokenAmount,
      orderId,
    });

    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(tokenAddress),
      new PublicKey(from)
    );
    console.log("fromTokenAccount", fromTokenAccount.toString());

    const toTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(tokenAddress),
      new PublicKey(to)
    );
    console.log("toTokenAccount", toTokenAccount.toString());

    // Check if token accounts exist
    const fromAccountInfo = await connection.getAccountInfo(fromTokenAccount);
    const toAccountInfo = await connection.getAccountInfo(toTokenAccount);

    if (!fromAccountInfo) {
      // translate to english
      throw new Error(
        "Sender Token Account not found, please add Token asset in Phantom wallet and get Token."
      );
    }
    if (!toAccountInfo) {
      throw new Error(
        "Receiver Token Account not found, please add Token asset in receiver's wallet."
      );
    }

    // 检查付款人余额
    const fromTokenAccountParsed =
      await connection.getParsedAccountInfo(fromTokenAccount);
    let fromBalance: number | undefined = undefined;
    if (
      fromTokenAccountParsed.value &&
      "parsed" in fromTokenAccountParsed.value.data &&
      fromTokenAccountParsed.value.data.program === "spl-token"
    ) {
      fromBalance =
        fromTokenAccountParsed.value.data.parsed.info.tokenAmount.amount;
    }
    console.log("付款人 Token 余额:", fromBalance);
    if (
      fromBalance === undefined ||
      BigInt(fromBalance) < BigInt(tokenAmount)
    ) {
      throw new Error(
        `Sender Token balance not enough, current balance: ${fromBalance ?? 0}, need: ${tokenAmount}`
      );
    }

    // 检查收款人账户状态
    const toTokenAccountParsed =
      await connection.getParsedAccountInfo(toTokenAccount);
    let toAccountState: string | undefined = undefined;
    if (
      toTokenAccountParsed.value &&
      "parsed" in toTokenAccountParsed.value.data &&
      toTokenAccountParsed.value.data.program === "spl-token"
    ) {
      toAccountState = toTokenAccountParsed.value.data.parsed.info.state;
    }
    if (toAccountState !== undefined && toAccountState !== "initialized") {
      throw new Error(
        "Receiver Token Account state is abnormal, please check the account."
      );
    }

    // Transfer instruction
    const transferIx = createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      new PublicKey(from),
      BigInt(tokenAmount)
    );

    // Memo instruction
    const memoIx = createMemoInstruction(
      JSON.stringify({
        webpay: {
          orderId,
        },
      }),
      new PublicKey(from)
    );

    const tx = new Transaction().add(transferIx, memoIx);
    tx.feePayer = new PublicKey(from);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    console.log("Transaction created successfully");
    return tx;
  } catch (error) {
    console.error("Error creating transaction:", error);
    throw error;
  }
}

export async function createSolTransferTransaction({
  from,
  to,
  tokenAmount,
  orderId,
}: TransactionParams): Promise<Transaction> {
  try {
    // Convert SOL to lamports
    const lamports = BigInt(tokenAmount);

    // Validate inputs
    if (!from || !to || !tokenAmount) {
      throw new Error("Missing required transaction parameters");
    }

    const fromPubkey = new PublicKey(from);
    const toPubkey = new PublicKey(to);

    console.log("Creating SOL transaction with params:", {
      from: fromPubkey.toBase58(),
      to: toPubkey.toBase58(),
      lamports,
      orderId,
    });

    // Get the current status of the cluster to ensure connection is working
    console.log("Checking connection to", import.meta.env.VITE_SOLANA_RPC);
    const clusterStatus = await connection.getVersion();
    console.log("Solana cluster status:", clusterStatus);

    // Check sender's SOL balance with explicit confirmation
    const fromBalance = await connection.getBalance(fromPubkey, "confirmed");
    console.log("Sender balance:", fromBalance / LAMPORTS_PER_SOL, "SOL");

    // Ensure there's enough balance for the transaction plus fees
    // Estimate fees conservatively at 0.000005 SOL (5000 lamports)
    const estimatedFee = 5000;
    const totalNeeded = lamports + BigInt(estimatedFee);

    if (fromBalance < totalNeeded) {
      throw new Error(
        `Sender SOL balance not enough, current balance: ${fromBalance / LAMPORTS_PER_SOL}, need: ${tokenAmount} + fee`
      );
    }

    // Check if recipient account exists
    const toAccountInfo = await connection.getAccountInfo(toPubkey);
    if (!toAccountInfo) {
      throw new Error("Receiver account not found");
    }

    // Create a new transaction
    const tx = new Transaction();

    // Transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports,
    });

    // Add the transfer instruction
    tx.add(transferIx);

    // Add memo instruction with orderId
    const memoIx = createMemoInstruction(
      JSON.stringify({
        webpay: {
          orderId,
        },
      }),
      fromPubkey
    );
    tx.add(memoIx);

    // Set fee payer
    tx.feePayer = fromPubkey;

    // Get a fresh blockhash with confirmed commitment
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    tx.recentBlockhash = blockhash;
    console.log(
      "Using blockhash:",
      blockhash,
      "valid until height:",
      lastValidBlockHeight
    );

    // Log detailed transaction information
    console.log(
      "SOL Transaction created with instructions:",
      tx.instructions.map((ins) => ({
        programId: ins.programId.toBase58(),
        keys: ins.keys.map((k) => ({
          pubkey: k.pubkey.toBase58(),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
      }))
    );

    return tx;
  } catch (error) {
    console.error("Error creating SOL transaction:", error);
    throw error;
  }
}

/**
 * 广播签名后的交易到 Solana 网络
 * @param signedTransaction 已签名的交易对象
 * @returns 交易哈希字符串
 */
export async function sendRawTransaction(
  signedTransaction: Transaction
): Promise<string> {
  try {
    console.log("Broadcasting signed transaction...");

    // 序列化交易
    const serializedTransaction = signedTransaction.serialize();

    // 发送交易到网络
    const signature = await connection.sendRawTransaction(
      serializedTransaction,
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );

    console.log("Transaction broadcasted successfully:", signature);

    // 等待交易确认 - 使用更兼容的方式
    try {
      // 方法1：使用 confirmTransaction（可能在某些RPC节点失败）
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log("Transaction confirmed:", signature);
      return signature;
    } catch (confirmError: any) {
      // 如果 confirmTransaction 失败（比如 signatureSubscribe 不支持），使用轮询方式
      if (
        confirmError.message?.includes("signatureSubscribe") ||
        confirmError.message?.includes("Method not found")
      ) {
        console.log(
          "signatureSubscribe not supported, using polling method..."
        );

        // 方法2：使用轮询方式确认交易
        const maxAttempts = 30; // 最多轮询30次
        const pollInterval = 2000; // 每2秒轮询一次

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const status = await connection.getSignatureStatus(signature, {
              searchTransactionHistory: true,
            });

            if (status.value) {
              if (status.value.err) {
                throw new Error(`Transaction failed: ${status.value.err}`);
              }
              if (
                status.value.confirmationStatus === "confirmed" ||
                status.value.confirmationStatus === "finalized"
              ) {
                console.log("Transaction confirmed via polling:", signature);
                return signature;
              }
            }

            // 等待下次轮询
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          } catch (pollError) {
            console.warn(`Polling attempt ${attempt} failed:`, pollError);
            if (attempt === maxAttempts) {
              throw new Error(
                `Transaction confirmation timeout after ${maxAttempts} attempts`
              );
            }
          }
        }

        throw new Error("Transaction confirmation timeout");
      } else {
        // 其他类型的错误直接抛出
        throw confirmError;
      }
    }
  } catch (error) {
    console.error("Error broadcasting transaction:", error);
    throw error;
  }
}
