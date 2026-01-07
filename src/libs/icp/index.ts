import type {
  ActorConfig,
  ActorSubclass,
  Agent,
  HttpAgentOptions,
} from '@dfinity/agent'
import { Actor, HttpAgent } from '@dfinity/agent'
import type { Principal } from '@dfinity/principal'
// import type { IDL } from "@dfinity/candid";
import { type _SERVICE, idlFactory } from './service'

// export declare const idlFactory: IDL.InterfaceFactory;
export declare const canisterId: string

export declare interface CreateActorOptions {
  /**
   * @see {@link Agent}
   */
  agent?: Agent
  /**
   * @see {@link HttpAgentOptions}
   */
  agentOptions?: HttpAgentOptions
  /**
   * @see {@link ActorConfig}
   */
  actorOptions?: ActorConfig
}

/**
 * Intializes an {@link ActorSubclass}, configured with the provided SERVICE interface of a canister.
 * @constructs {@link ActorSubClass}
 * @param {string | Principal} canisterId - ID of the canister the {@link Actor} will talk to
 * @param {CreateActorOptions} options - see {@link CreateActorOptions}
 * @param {CreateActorOptions["agent"]} options.agent - a pre-configured agent you'd like to use. Supercedes agentOptions
 * @param {CreateActorOptions["agentOptions"]} options.agentOptions - options to set up a new agent
 * @see {@link HttpAgentOptions}
 * @param {CreateActorOptions["actorOptions"]} options.actorOptions - options for the Actor
 * @see {@link ActorConfig}
 */
export function createActor(
  canisterId: string | Principal,
  options?: CreateActorOptions
): ActorSubclass<_SERVICE> {
  const agent =
    options?.agent || HttpAgent.createSync({ ...options?.agentOptions })

  return Actor.createActor(idlFactory, {
    agent,
    canisterId,
    ...options?.actorOptions,
  })
}

/**
 * Intialized Actor using default settings, ready to talk to a canister using its candid interface
 * @constructs {@link ActorSubClass}
 */
export declare const swifty_wallet_backend: ActorSubclass<_SERVICE>

export type { _SERVICE } from './service'
