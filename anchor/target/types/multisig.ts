/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/multisig.json`.
 */
export type Multisig = {
  "address": "3iowdFMjwgiGVPyQDRQyMzVzdF7qiMGK1rd85zzDj4HK",
  "metadata": {
    "name": "multisig",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "docs": [
    "多签钱包程序模块，包含所有指令逻辑"
  ],
  "instructions": [
    {
      "name": "approve",
      "docs": [
        "批准交易"
      ],
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "multisig"
        },
        {
          "name": "transaction",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createTransaction",
      "docs": [
        "创建交易提案",
        "- `pid`: 目标程序 ID",
        "- `accs`: 交易涉及的账户列表",
        "- `data`: 交易指令数据"
      ],
      "discriminator": [
        227,
        193,
        53,
        239,
        55,
        126,
        112,
        105
      ],
      "accounts": [
        {
          "name": "multisig"
        },
        {
          "name": "transaction",
          "writable": true,
          "signer": true
        },
        {
          "name": "proposer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "pid",
          "type": "pubkey"
        },
        {
          "name": "accs",
          "type": {
            "vec": {
              "defined": {
                "name": "transactionAccount"
              }
            }
          }
        },
        {
          "name": "data",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "executeTransaction",
      "docs": [
        "执行交易"
      ],
      "discriminator": [
        231,
        173,
        49,
        91,
        235,
        24,
        68,
        19
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "multisigSigner",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "transaction",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "初始化多签钱包",
        "- `owners`: 多签所有者公钥列表",
        "- `threshold`: 执行交易所需的最小签名数",
        "- `nonce`: PDA 签名用的随机数"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owners",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "threshold",
          "type": "u64"
        },
        {
          "name": "nonce",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "multisig",
      "discriminator": [
        224,
        116,
        121,
        186,
        68,
        161,
        79,
        236
      ]
    },
    {
      "name": "transaction",
      "discriminator": [
        11,
        24,
        174,
        129,
        203,
        117,
        242,
        23
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidOwner",
      "msg": "The given owner is not part of this multisig."
    },
    {
      "code": 6001,
      "name": "invalidThreshold",
      "msg": "Threshold must be > 0 and <= total owners."
    },
    {
      "code": 6002,
      "name": "invalidOwners",
      "msg": "Owners list cannot be empty."
    },
    {
      "code": 6003,
      "name": "alreadyExecuted",
      "msg": "Transaction has already been executed."
    },
    {
      "code": 6004,
      "name": "notEnoughSignatures",
      "msg": "Not enough signers to execute transaction."
    },
    {
      "code": 6005,
      "name": "ownerSetChanged",
      "msg": "The owner set has changed since the transaction was created."
    },
    {
      "code": 6006,
      "name": "tooManyOwners",
      "msg": "Too many owners provided."
    },
    {
      "code": 6007,
      "name": "tooManyAccounts",
      "msg": "Too many accounts in transaction."
    },
    {
      "code": 6008,
      "name": "invalidMultisig",
      "msg": "Invalid multisig account."
    },
    {
      "code": 6009,
      "name": "invalidAccounts",
      "msg": "Invalid accounts provided for execution."
    }
  ],
  "types": [
    {
      "name": "multisig",
      "docs": [
        "多签钱包账户的数据结构"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owners",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "type": "u64"
          },
          {
            "name": "nonce",
            "type": "u8"
          },
          {
            "name": "ownersVersion",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "transaction",
      "docs": [
        "交易提案账户的数据结构"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "programId",
            "type": "pubkey"
          },
          {
            "name": "accounts",
            "type": {
              "vec": {
                "defined": {
                  "name": "transactionAccount"
                }
              }
            }
          },
          {
            "name": "data",
            "type": "bytes"
          },
          {
            "name": "signers",
            "type": {
              "vec": "bool"
            }
          },
          {
            "name": "executedAt",
            "type": "i64"
          },
          {
            "name": "ownersVersion",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "transactionAccount",
      "docs": [
        "交易账户的元数据结构"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey",
            "type": "pubkey"
          },
          {
            "name": "isSigner",
            "type": "bool"
          },
          {
            "name": "isWritable",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
