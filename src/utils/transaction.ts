import {
  PublicKey,
  Connection,
  Transaction,
  clusterApiUrl,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { TransactionParams } from "@/types/payment";
import { SOLANA_NETWORK } from "./phantom";

const connection = new Connection(clusterApiUrl(SOLANA_NETWORK));

// Helper to create a Memo instruction
function createMemoInstruction(
  memo: string,
  signer: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
    data: new TextEncoder().encode(memo) as Buffer,
  });
}

export async function createUsdcTransferTransaction({
  from,
  to,
  amount,
  usdcMint,
  orderId,
}: TransactionParams): Promise<Transaction> {
  try {
    if (!usdcMint) {
      throw new Error("USDC mint address is required for SPL token payment");
    }

    // USDC has 6 decimals
    const usdcDecimals = 6;
    const usdcAmount = Math.round(amount * 10 ** usdcDecimals);

    console.log("Creating transaction with params:", {
      from: from.toString(),
      to: to.toString(),
      usdcMint: usdcMint.toString(),
      usdcAmount,
      orderId,
    });

    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(usdcMint),
      new PublicKey(from)
    );
    const toTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(usdcMint),
      new PublicKey(to)
    );

    console.log("Token accounts:", {
      fromTokenAccount: fromTokenAccount.toString(),
      toTokenAccount: toTokenAccount.toString(),
    });

    // Check if token accounts exist
    const fromAccountInfo = await connection.getAccountInfo(fromTokenAccount);
    const toAccountInfo = await connection.getAccountInfo(toTokenAccount);

    if (!fromAccountInfo) {
      throw new Error(
        "付款人 USDC Token Account 不存在，请先在 Phantom 钱包内添加 USDC 资产并获取 USDC。"
      );
    }
    if (!toAccountInfo) {
      throw new Error(
        "收款人 USDC Token Account 不存在，请联系收款人先添加 USDC 资产。"
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
        fromTokenAccountParsed.value.data.parsed.info.tokenAmount.uiAmount;
    }
    console.log("付款人 USDC 余额:", fromBalance);
    if (fromBalance === undefined || fromBalance < amount) {
      throw new Error(
        `付款人 USDC 余额不足，当前余额：${fromBalance ?? 0}，需要：${amount}`
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
      usdcAmount
    );

    // Memo instruction
    const memoIx = createMemoInstruction(orderId, new PublicKey(from));

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
  amount,
  orderId,
}: TransactionParams): Promise<Transaction> {
  try {
    // Convert SOL to lamports
    const lamports = Math.round(amount * LAMPORTS_PER_SOL);

    console.log("Creating SOL transaction with params:", {
      from: from.toString(),
      to: to.toString(),
      lamports,
      orderId,
    });

    // Check sender's SOL balance
    const fromBalance = await connection.getBalance(new PublicKey(from));
    if (fromBalance < lamports) {
      throw new Error(
        `付款人 SOL 余额不足，当前余额：${fromBalance / LAMPORTS_PER_SOL}，需要：${amount}`
      );
    }

    // Check if recipient account exists
    const toAccountInfo = await connection.getAccountInfo(new PublicKey(to));
    if (!toAccountInfo) {
      throw new Error("收款人账户不存在");
    }

    // Transfer instruction
    const transferIx = SystemProgram.transfer({
      fromPubkey: new PublicKey(from),
      toPubkey: new PublicKey(to),
      lamports,
    });

    // const memoIx = createMemoInstruction(orderId, new PublicKey(from));

    const tx = new Transaction().add(transferIx);
    // tx.add(memoIx);
    tx.feePayer = new PublicKey(from);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    console.log("SOL Transaction created successfully");
    return tx;
  } catch (error) {
    console.error("Error creating SOL transaction:", error);
    throw error;
  }
}
