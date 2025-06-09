// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import MultisigIDL from '../target/idl/multisig.json'
import type { Multisig } from '../target/types/multisig'

// Re-export the generated IDL and type
export { Multisig, MultisigIDL }

// The programId is imported from the program IDL.
export const MULTISIG_PROGRAM_ID = new PublicKey(MultisigIDL.address)

// This is a helper function to get the Multisig Anchor program.
export function getMultisigProgram(provider: AnchorProvider, address?: PublicKey): Program<Multisig> {
  return new Program({ ...MultisigIDL, address: address ? address.toBase58() : MultisigIDL.address } as Multisig, provider)
}

// This is a helper function to get the program ID for the Multisig program depending on the cluster.
export function getMultisigProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
      // This is the program ID for the Multisig program on devnet and testnet.
      return new PublicKey('coUnmi3oBUtwtd9fjeAvSsJssXh5A5xyPbhpewyzRVF')
    case 'mainnet-beta':
    default:
      return MULTISIG_PROGRAM_ID
  }
}

