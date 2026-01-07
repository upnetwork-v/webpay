import type {Principal} from '@dfinity/principal';
import type {ActorMethod} from '@dfinity/agent';
import type {IDL} from '@dfinity/candid';

export interface BindingDelegationDeatils {
  username: string;
  login_details: LoginDetails;
}
export interface Delegation {
  pubkey: Uint8Array | number[];
  targets: [] | [Array<Principal>];
  expiration: bigint;
}
export interface LoginDetails {
  user_canister_pubkey: Uint8Array | number[];
  expiration: bigint;
}
export type Result = {Ok: string} | {Err: string};
export type Result_1 = {Ok: BindingDelegationDeatils} | {Err: string};
export interface SendTxInput {
  tx: Uint8Array | number[];
  from_subaccount: [] | [Uint8Array | number[]];
}
export interface ServerSig {
  server_sig: string;
  timestamp: string;
}
export interface SessionInfo {
  status: number;
  session_id: string;
  create_time: bigint;
  expire_time: bigint;
}
export interface SessionInfoQuery {
  status: number;
  session_id: string;
  create_time: bigint;
  expire_time: bigint;
  current_time: bigint;
}
export interface SignRequest {
  to: string;
  gas: bigint;
  value: bigint;
  max_priority_fee_per_gas: bigint;
  data: [] | [string];
  max_fee_per_gas: bigint;
  chain_id: bigint;
  nonce: bigint;
}
export interface SignedDelegation {
  signature: Uint8Array | number[];
  delegation: Delegation;
}
export type SignedDelegationResult = {Ok: SignedDelegation} | {Err: string};
export interface UserProfile {
  modify_time: bigint;
  username: string;
  public_key: string;
  doge_testnet_address: [] | [string];
  passkey_name: Array<string>;
  display_name: string;
  create_time: bigint;
  solana_address: [] | [string];
  principal_id: [] | [string];
  doge_address: string;
}
export interface _SERVICE {
  add_new_passkey_session_via_principal: ActorMethod<
    [],
    {Ok: string} | {Err: string}
  >;
  binding_verification_code_via_principal: ActorMethod<
    [string],
    {Ok: string} | {Err: string}
  >;
  change_bot_token: ActorMethod<[string], boolean>;
  change_displayname_via_principal: ActorMethod<
    [string],
    {Ok: string} | {Err: string}
  >;
  check_session_id: ActorMethod<[string], [] | [SessionInfoQuery]>;
  check_session_via_username: ActorMethod<[string], [] | [SessionInfoQuery]>;
  convert_doge_address: ActorMethod<[string], Result>;
  convert_doge_address_via_caller: ActorMethod<[], Result>;
  convert_doge_testnet_address: ActorMethod<[string], Result>;
  convert_doge_testnet_address_via_caller: ActorMethod<[], Result>;
  convert_eth_address: ActorMethod<[string], string>;
  delete_passkey_via_principal: ActorMethod<
    [string],
    {Ok: string} | {Err: string}
  >;
  doge_sign_tx: ActorMethod<[SendTxInput], Result>;
  doge_testnet_sign_tx: ActorMethod<[SendTxInput], Result>;
  finish_add_new_passkey_session: ActorMethod<[string], string>;
  finish_authentication: ActorMethod<
    [string, string],
    {Ok: string} | {Err: string}
  >;
  finish_authentication_username: ActorMethod<[string], string>;
  finish_binding_verification_code: ActorMethod<
    [string],
    {Ok: string} | {Err: string}
  >;
  finish_change_displayname: ActorMethod<
    [string, string],
    {Ok: string} | {Err: string}
  >;
  finish_create_new_passkey_generate_verification_code: ActorMethod<
    [string],
    {Ok: string} | {Err: string}
  >;
  finish_delete_passkey: ActorMethod<[string], {Ok: string} | {Err: string}>;
  finish_register: ActorMethod<
    [string],
    {Ok: [string, string]} | {Err: string}
  >;
  finish_register_username: ActorMethod<
    [string],
    {Ok: [string, string]} | {Err: string}
  >;
  get_allow_credentials_name: ActorMethod<[string], [] | [string]>;
  get_certified_data: ActorMethod<
    [string],
    [] | [[string, Uint8Array | number[], Uint8Array | number[]]]
  >;
  get_config: ActorMethod<[], string>;
  get_user_principal: ActorMethod<[string], string>;
  get_username_by_credential: ActorMethod<[string], [] | [string]>;
  greet: ActorMethod<[], string>;
  is_username_registered: ActorMethod<[string], [] | [boolean]>;
  public_key: ActorMethod<
    [string],
    {Ok: {public_key_hex: string}} | {Err: string}
  >;
  schnorr_public_key: ActorMethod<
    [string],
    {Ok: {public_key_hex: string}} | {Err: string}
  >;
  schnorr_sign: ActorMethod<
    [string],
    {Ok: {signature_hex: string}} | {Err: string}
  >;
  set_certified_data: ActorMethod<[string, string], undefined>;
  sign_bytes65: ActorMethod<
    [number, string],
    {Ok: {signature_hex: string}} | {Err: string}
  >;
  sign_principal: ActorMethod<[], {Ok: [string, string]} | {Err: string}>;
  sign_transaction_via_authentication: ActorMethod<
    [SignRequest, string],
    {Ok: string} | {Err: string}
  >;
  sign_transaction_via_passkey: ActorMethod<
    [SignRequest],
    {Ok: string} | {Err: string}
  >;
  siwp_get_delegation: ActorMethod<
    [string, Uint8Array | number[], bigint],
    SignedDelegationResult
  >;
  siwp_login: ActorMethod<
    [string, string, Uint8Array | number[], [] | [bigint]],
    Result_1
  >;
  siwp_login_username: ActorMethod<
    [string, Uint8Array | number[], [] | [bigint]],
    Result_1
  >;
  siwp_prepare_login: ActorMethod<[], [string, string]>;
  siwp_prepare_login_username: ActorMethod<[string], string>;
  solana_address: ActorMethod<[string], Result>;
  start_add_new_passkey_session: ActorMethod<[string], string>;
  start_binding_verification_code: ActorMethod<
    [string, string],
    {Ok: string} | {Err: string}
  >;
  start_change_displayname: ActorMethod<[string], string>;
  start_create_new_passkey: ActorMethod<
    [string, string],
    {Ok: string} | {Err: string}
  >;
  start_delete_passkey: ActorMethod<
    [string, string],
    {Ok: string} | {Err: string}
  >;
  start_register: ActorMethod<
    [string, string],
    {Ok: [string, string]} | {Err: string}
  >;
  start_register_username: ActorMethod<
    [string, string, ServerSig, string],
    {Ok: string} | {Err: string}
  >;
  user_profile_get: ActorMethod<[string], [] | [UserProfile]>;
  user_profile_get_by_pub_key: ActorMethod<[string], [] | [UserProfile]>;
  user_profile_update_doge_testnet_by_pub_key: ActorMethod<
    [string],
    [] | [UserProfile]
  >;
  user_profile_update_dogetestnet: ActorMethod<[string], [] | [UserProfile]>;
  user_profile_update_solana: ActorMethod<[string], [] | [UserProfile]>;
  verify_bytes65: ActorMethod<
    [string, string, string],
    {Ok: {is_signature_valid: boolean}} | {Err: string}
  >;
  verify_server_sig: ActorMethod<[string, string, string], boolean>;
}

// export declare const idlFactory: IDL.InterfaceFactory;

export const idlFactory: IDL.InterfaceFactory = ({IDL}) => {
  const SessionInfoQuery = IDL.Record({
    status: IDL.Nat8,
    session_id: IDL.Text,
    create_time: IDL.Nat64,
    expire_time: IDL.Nat64,
    current_time: IDL.Nat64,
  });
  const Result = IDL.Variant({Ok: IDL.Text, Err: IDL.Text});
  const SendTxInput = IDL.Record({
    tx: IDL.Vec(IDL.Nat8),
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });
  const SignRequest = IDL.Record({
    to: IDL.Text,
    gas: IDL.Nat,
    value: IDL.Nat,
    max_priority_fee_per_gas: IDL.Nat,
    data: IDL.Opt(IDL.Text),
    max_fee_per_gas: IDL.Nat,
    chain_id: IDL.Nat,
    nonce: IDL.Nat,
  });
  const Delegation = IDL.Record({
    pubkey: IDL.Vec(IDL.Nat8),
    targets: IDL.Opt(IDL.Vec(IDL.Principal)),
    expiration: IDL.Nat64,
  });
  const SignedDelegation = IDL.Record({
    signature: IDL.Vec(IDL.Nat8),
    delegation: Delegation,
  });
  const SignedDelegationResult = IDL.Variant({
    Ok: SignedDelegation,
    Err: IDL.Text,
  });
  const LoginDetails = IDL.Record({
    user_canister_pubkey: IDL.Vec(IDL.Nat8),
    expiration: IDL.Nat64,
  });
  const BindingDelegationDeatils = IDL.Record({
    username: IDL.Text,
    login_details: LoginDetails,
  });
  const Result_1 = IDL.Variant({
    Ok: BindingDelegationDeatils,
    Err: IDL.Text,
  });
  const ServerSig = IDL.Record({
    server_sig: IDL.Text,
    timestamp: IDL.Text,
  });
  const UserProfile = IDL.Record({
    modify_time: IDL.Nat64,
    username: IDL.Text,
    public_key: IDL.Text,
    doge_testnet_address: IDL.Opt(IDL.Text),
    passkey_name: IDL.Vec(IDL.Text),
    display_name: IDL.Text,
    create_time: IDL.Nat64,
    solana_address: IDL.Opt(IDL.Text),
    principal_id: IDL.Opt(IDL.Text),
    doge_address: IDL.Text,
  });
  return IDL.Service({
    add_new_passkey_session_via_principal: IDL.Func(
      [],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    binding_verification_code_via_principal: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    change_bot_token: IDL.Func([IDL.Text], [IDL.Bool], []),
    change_displayname_via_principal: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    check_session_id: IDL.Func(
      [IDL.Text],
      [IDL.Opt(SessionInfoQuery)],
      ['query'],
    ),
    check_session_via_username: IDL.Func(
      [IDL.Text],
      [IDL.Opt(SessionInfoQuery)],
      ['query'],
    ),
    convert_doge_address: IDL.Func([IDL.Text], [Result], []),
    convert_doge_address_via_caller: IDL.Func([], [Result], []),
    convert_doge_testnet_address: IDL.Func([IDL.Text], [Result], []),
    convert_doge_testnet_address_via_caller: IDL.Func([], [Result], []),
    convert_eth_address: IDL.Func([IDL.Text], [IDL.Text], []),
    delete_passkey_via_principal: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    doge_sign_tx: IDL.Func([SendTxInput], [Result], []),
    doge_testnet_sign_tx: IDL.Func([SendTxInput], [Result], []),
    finish_add_new_passkey_session: IDL.Func([IDL.Text], [IDL.Text], []),
    finish_authentication: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    finish_authentication_username: IDL.Func([IDL.Text], [IDL.Text], []),
    finish_binding_verification_code: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    finish_change_displayname: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    finish_create_new_passkey_generate_verification_code: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    finish_delete_passkey: IDL.Func(
      [IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    finish_register: IDL.Func(
      [IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Tuple(IDL.Text, IDL.Text),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    finish_register_username: IDL.Func(
      [IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Tuple(IDL.Text, IDL.Text),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    get_allow_credentials_name: IDL.Func(
      [IDL.Text],
      [IDL.Opt(IDL.Text)],
      ['query'],
    ),
    get_certified_data: IDL.Func(
      [IDL.Text],
      [IDL.Opt(IDL.Tuple(IDL.Text, IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8)))],
      ['query'],
    ),
    get_config: IDL.Func([], [IDL.Text], ['query']),
    get_user_principal: IDL.Func([IDL.Text], [IDL.Text], ['query']),
    get_username_by_credential: IDL.Func(
      [IDL.Text],
      [IDL.Opt(IDL.Text)],
      ['query'],
    ),
    greet: IDL.Func([], [IDL.Text], ['query']),
    is_username_registered: IDL.Func([IDL.Text], [IDL.Opt(IDL.Bool)], []),
    public_key: IDL.Func(
      [IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Record({public_key_hex: IDL.Text}),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    schnorr_public_key: IDL.Func(
      [IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Record({public_key_hex: IDL.Text}),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    schnorr_sign: IDL.Func(
      [IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Record({signature_hex: IDL.Text}),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    set_certified_data: IDL.Func([IDL.Text, IDL.Text], [], []),
    sign_bytes65: IDL.Func(
      [IDL.Nat32, IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Record({signature_hex: IDL.Text}),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    sign_principal: IDL.Func(
      [],
      [
        IDL.Variant({
          Ok: IDL.Tuple(IDL.Text, IDL.Text),
          Err: IDL.Text,
        }),
      ],
      ['query'],
    ),
    sign_transaction_via_authentication: IDL.Func(
      [SignRequest, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    sign_transaction_via_passkey: IDL.Func(
      [SignRequest],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    siwp_get_delegation: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Nat8), IDL.Nat64],
      [SignedDelegationResult],
      ['query'],
    ),
    siwp_login: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Vec(IDL.Nat8), IDL.Opt(IDL.Nat64)],
      [Result_1],
      [],
    ),
    siwp_login_username: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Nat8), IDL.Opt(IDL.Nat64)],
      [Result_1],
      [],
    ),
    siwp_prepare_login: IDL.Func([], [IDL.Text, IDL.Text], []),
    siwp_prepare_login_username: IDL.Func([IDL.Text], [IDL.Text], []),
    solana_address: IDL.Func([IDL.Text], [Result], []),
    start_add_new_passkey_session: IDL.Func([IDL.Text], [IDL.Text], []),
    start_binding_verification_code: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    start_change_displayname: IDL.Func([IDL.Text], [IDL.Text], []),
    start_create_new_passkey: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    start_delete_passkey: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    start_register: IDL.Func(
      [IDL.Text, IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Tuple(IDL.Text, IDL.Text),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    start_register_username: IDL.Func(
      [IDL.Text, IDL.Text, ServerSig, IDL.Text],
      [IDL.Variant({Ok: IDL.Text, Err: IDL.Text})],
      [],
    ),
    user_profile_get: IDL.Func([IDL.Text], [IDL.Opt(UserProfile)], []),
    user_profile_get_by_pub_key: IDL.Func(
      [IDL.Text],
      [IDL.Opt(UserProfile)],
      ['query'],
    ),
    user_profile_update_doge_testnet_by_pub_key: IDL.Func(
      [IDL.Text],
      [IDL.Opt(UserProfile)],
      [],
    ),
    user_profile_update_dogetestnet: IDL.Func(
      [IDL.Text],
      [IDL.Opt(UserProfile)],
      [],
    ),
    user_profile_update_solana: IDL.Func(
      [IDL.Text],
      [IDL.Opt(UserProfile)],
      [],
    ),
    verify_bytes65: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [
        IDL.Variant({
          Ok: IDL.Record({is_signature_valid: IDL.Bool}),
          Err: IDL.Text,
        }),
      ],
      [],
    ),
    verify_server_sig: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [IDL.Bool],
      ['query'],
    ),
  });
};

export declare const init: (args: {IDL: typeof IDL}) => IDL.Type[];
