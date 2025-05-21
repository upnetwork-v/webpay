import { useState, useEffect, useCallback } from 'react';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { 
  openPhantomConnectDeeplink, 
  openPhantomSignAndSendTransactionDeeplink,
  decryptPhantomPayload,
  decryptTransactionResponse
} from '@/utils/phantom';

type UsePhantomWalletReturn = {
  phantomConnected: boolean;
  phantomPublicKey: string | null;
  phantomSession: string | null;
  phantomEncryptionPublicKey: string | null;
  dappKeyPair: nacl.BoxKeyPair | null;
  connectPhantom: () => void;
  signAndSendTransaction: (tx: any, redirectUrl: string, session: string) => void;
  processTransactionResponse: (data: string, nonce: string) => Promise<{signature: string} | null>;
  processConnectCallback: (phantomPk: string, nonce: string, data: string) => boolean;
};

export const usePhantomWallet = (): UsePhantomWalletReturn => {
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [phantomPublicKey, setPhantomPublicKey] = useState<string | null>(null);
  const [phantomSession, setPhantomSession] = useState<string | null>(null);
  const [phantomEncryptionPublicKey, setPhantomEncryptionPublicKey] = useState<string | null>(null);
  const [dappKeyPair, setDappKeyPair] = useState<nacl.BoxKeyPair | null>(null);

  // Initialize dapp keypair
  useEffect(() => {
    const pk = localStorage.getItem('dapp_pk');
    const sk = localStorage.getItem('dapp_sk');
    let keypair: nacl.BoxKeyPair;
    
    if (pk && sk) {
      keypair = {
        publicKey: bs58.decode(pk),
        secretKey: bs58.decode(sk),
      };
    } else {
      keypair = nacl.box.keyPair();
      localStorage.setItem('dapp_pk', bs58.encode(keypair.publicKey));
      localStorage.setItem('dapp_sk', bs58.encode(keypair.secretKey));
    }
    
    setDappKeyPair(keypair);
  }, []);

  // Load saved wallet connection info
  useEffect(() => {
    const savedPhantomPk = localStorage.getItem('phantom_encryption_public_key');
    const savedPhantomPublicKey = localStorage.getItem('phantom_public_key');
    const savedPhantomSession = localStorage.getItem('phantom_session');

    if (savedPhantomPk && savedPhantomPublicKey && savedPhantomSession) {
      setPhantomEncryptionPublicKey(savedPhantomPk);
      setPhantomPublicKey(savedPhantomPublicKey);
      setPhantomSession(savedPhantomSession);
      setPhantomConnected(true);
    }
  }, []);

  // Handle Phantom connect
  const connectPhantom = useCallback(() => {
    if (!dappKeyPair) return;
    
    const dappPublicKey = bs58.encode(dappKeyPair.publicKey);
    openPhantomConnectDeeplink(dappPublicKey);
  }, [dappKeyPair]);

  // Sign and send transaction
  const signAndSendTransaction = useCallback((tx: any, redirectUrl: string, session: string) => {
    if (!dappKeyPair || !phantomEncryptionPublicKey) {
      throw new Error('Wallet not properly initialized');
    }

    console.log('Complete transaction object:', {
      feePayer: tx.feePayer?.toBase58(),
      recentBlockhash: tx.recentBlockhash,
      instructions: tx.instructions.length,
      signers: tx.signatures.length,
    });

    openPhantomSignAndSendTransactionDeeplink(
      tx,
      redirectUrl,
      phantomEncryptionPublicKey,
      dappKeyPair,
      session
    );
  }, [dappKeyPair, phantomEncryptionPublicKey]);

  // Process transaction response
  const processTransactionResponse = useCallback(async (data: string, nonce: string) => {
    if (!dappKeyPair || !phantomEncryptionPublicKey) {
      console.error('Missing required keys for decryption');
      return null;
    }

    try {
      const response = decryptTransactionResponse(
        phantomEncryptionPublicKey,
        nonce,
        data,
        dappKeyPair
      );
      
      return response;
    } catch (error) {
      console.error('Error processing transaction response:', error);
      throw error;
    }
  }, [dappKeyPair, phantomEncryptionPublicKey]);

  // Process connect callback
  const processConnectCallback = useCallback((phantomPk: string, nonce: string, data: string) => {
    if (!dappKeyPair) return false;

    try {
      const decryptedData = decryptPhantomPayload(
        phantomPk,
        nonce,
        data,
        dappKeyPair
      );

      // Save wallet connection info
      localStorage.setItem('phantom_encryption_public_key', phantomPk);
      localStorage.setItem('phantom_public_key', decryptedData.public_key);
      localStorage.setItem('phantom_session', decryptedData.session);

      setPhantomPublicKey(decryptedData.public_key);
      setPhantomSession(decryptedData.session);
      setPhantomEncryptionPublicKey(phantomPk);
      setPhantomConnected(true);

      console.log('Phantom wallet connected successfully', {
        publicKey: decryptedData.public_key,
        sessionAvailable: !!decryptedData.session,
        encryptionPublicKey: phantomPk,
      });

      return true;
    } catch (error) {
      console.error('Failed to process Phantom connect callback:', error);
      return false;
    }
  }, [dappKeyPair]);

  return {
    phantomConnected,
    phantomPublicKey,
    phantomSession,
    phantomEncryptionPublicKey,
    dappKeyPair,
    connectPhantom,
    signAndSendTransaction,
    processTransactionResponse,
    processConnectCallback,
  };
};
