/**
 * SIWP Provider - Web adapted from upnetwork-v2
 *
 * Provides Canister API calls for Sign-In with Passkey authentication.
 * Uses Web Crypto API instead of react-native-passkey.
 */

import {
  Actor,
  HttpAgent,
  type ActorConfig,
  type ActorSubclass,
  type DerEncodedPublicKey,
  type HttpAgentOptions,
} from '@dfinity/agent'
import type { IDL } from '@dfinity/candid'
import type { _SERVICE } from '../libs/icp/service'

/**
 * Creates an anonymous actor for interactions with the Internet Computer.
 */
export function createAnonymousActor({
  idlFactory,
  canisterId,
  httpAgentOptions,
  actorOptions,
  isLocalNetwork,
}: {
  idlFactory: IDL.InterfaceFactory
  canisterId: string
  httpAgentOptions?: HttpAgentOptions
  actorOptions?: ActorConfig
  isLocalNetwork?: boolean
}) {
  if (!idlFactory || !canisterId) return undefined

  const agent = HttpAgent.createSync({ retryTimes: 2, ...httpAgentOptions })

  if (isLocalNetwork) {
    agent.fetchRootKey().catch((err) => {
      console.warn(
        'Unable to fetch root key. Check to ensure that your local replica is running'
      )
      console.warn(err)
    })
  }

  return {
    actor: Actor.createActor<_SERVICE>(idlFactory, {
      agent,
      canisterId,
      ...actorOptions,
    }),
    agent,
  }
}

/**
 * Prepares login by calling the Canister and invoking Web Passkey
 */
export async function callPrepareLogin(
  anonymousActor: ActorSubclass<_SERVICE>,
  username?: string
): Promise<string | [string, string]> {
  if (!anonymousActor) {
    throw new Error('Invalid actor')
  }

  let response
  try {
    response =
      username !== undefined
        ? await anonymousActor.siwp_prepare_login_username(username)
        : await anonymousActor.siwp_prepare_login()
  } catch (err) {
    throw new Error((err as Error).message)
  }

  if (!Array.isArray(response) && !response) {
    throw new Error('Invalid prepare response')
  }

  // Parse WebAuthn options
  const webauthnConfig = Array.isArray(response) ? response[0] : response
  const authOptions = JSON.parse(webauthnConfig).publicKey

  // Convert challenge from base64url to ArrayBuffer
  authOptions.challenge = base64UrlToArrayBuffer(authOptions.challenge)

  // Convert allowCredentials if present
  if (authOptions.allowCredentials) {
    authOptions.allowCredentials = authOptions.allowCredentials.map(
      (cred: { id: string; type: string; transports?: string[] }) => ({
        ...cred,
        id: base64UrlToArrayBuffer(cred.id),
      })
    )
  }

  // Call Web Passkey API
  const credential = await navigator.credentials.get({
    publicKey: authOptions,
  })

  if (!credential) {
    throw new Error('Passkey authentication cancelled')
  }

  const asseResp = credentialToJSON(credential as PublicKeyCredential)
  const asseRespStr = JSON.stringify(asseResp)

  return Array.isArray(response) ? [asseRespStr, response[1]] : asseRespStr
}

/**
 * Logs in the user by sending a signed SIWP message to the backend.
 */
export async function callLogin(
  anonymousActor: ActorSubclass<_SERVICE>,
  webauthnResponse: string,
  sessionPublicKey: DerEncodedPublicKey,
  authenticationState?: string,
  username?: string,
  expiration?: number
) {
  if (!anonymousActor) {
    throw new Error('Invalid actor')
  }

  let loginResponse
  try {
    loginResponse =
      username === undefined && authenticationState
        ? await anonymousActor.siwp_login(
            webauthnResponse,
            authenticationState,
            new Uint8Array(sessionPublicKey),
            !expiration ? [] : [BigInt(expiration * 1000000)]
          )
        : await anonymousActor.siwp_login_username(
            webauthnResponse,
            new Uint8Array(sessionPublicKey),
            !expiration ? [] : [BigInt(expiration * 1000000)]
          )
  } catch (e) {
    throw new Error((e as Error).message)
  }

  if ('Err' in loginResponse) {
    throw new Error(loginResponse.Err)
  }

  return loginResponse.Ok
}

/**
 * Retrieves a delegation from the backend for the current session.
 */
export async function callGetDelegation(
  anonymousActor: ActorSubclass<_SERVICE>,
  username: string | undefined,
  sessionPublicKey: DerEncodedPublicKey,
  expiration: bigint
) {
  if (!anonymousActor || !username) {
    throw new Error('Invalid actor or username')
  }

  const response = await anonymousActor.siwp_get_delegation(
    username,
    new Uint8Array(sessionPublicKey),
    expiration
  )

  if ('Err' in response) {
    throw new Error(response.Err)
  }

  return response.Ok
}

// Helper functions for base64url encoding/decoding

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Replace base64url characters with base64
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  // Add padding if needed
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function credentialToJSON(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse

  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle
        ? arrayBufferToBase64Url(response.userHandle)
        : null,
    },
  }
}
