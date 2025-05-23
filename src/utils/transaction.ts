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
      throw new Error(
        "付款人 Token Account 不存在，请先在 Phantom 钱包内添加 Token 资产并获取 Token。"
      );
    }
    if (!toAccountInfo) {
      throw new Error(
        "收款人 Token Account 不存在，请联系收款人先添加 Token 资产。"
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
        `付款人 Token 余额不足，当前余额：${fromBalance ?? 0}，需要：${tokenAmount}`
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
        "收款人 USDC Token Account 状态异常，请联系收款人检查账户。"
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
        `付款人 SOL 余额不足，当前余额：${fromBalance / LAMPORTS_PER_SOL}，需要：${tokenAmount} + 手续费`
      );
    }

    // Check if recipient account exists
    const toAccountInfo = await connection.getAccountInfo(toPubkey);
    if (!toAccountInfo) {
      throw new Error("收款人账户不存在");
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
