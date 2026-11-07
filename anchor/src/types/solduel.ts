/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solduel.json`.
 */
export type Solduel = {
  "address": "HtmYkFnCvn8E218UrvSiAgVjpuqBVyE54B71RvCgJM7u",
  "metadata": {
    "name": "solduel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Staked 1v1 minigames on Solana devnet"
  },
  "instructions": [
    {
      "name": "cancelRoom",
      "discriminator": [
        91,
        107,
        215,
        178,
        200,
        224,
        241,
        237
      ],
      "accounts": [
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimTimeout",
      "discriminator": [
        130,
        234,
        45,
        53,
        120,
        90,
        86,
        178
      ],
      "accounts": [
        {
          "name": "room",
          "writable": true
        },
        {
          "name": "claimant",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createRoom",
      "discriminator": [
        130,
        166,
        32,
        2,
        247,
        120,
        178,
        53
      ],
      "accounts": [
        {
          "name": "room",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  111,
                  111,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "creator",
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
          "name": "game",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        },
        {
          "name": "allowedOpponent",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "gameAction",
      "discriminator": [
        171,
        136,
        198,
        47,
        120,
        44,
        236,
        124
      ],
      "accounts": [
        {
          "name": "room",
          "writable": true
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "data",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "joinRoom",
      "discriminator": [
        95,
        232,
        188,
        81,
        124,
        130,
        78,
        139
      ],
      "accounts": [
        {
          "name": "room",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mintBadge",
      "discriminator": [
        242,
        234,
        237,
        183,
        232,
        245,
        146,
        1
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
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
          "name": "badge",
          "type": "u8"
        }
      ]
    },
    {
      "name": "quickPlay",
      "discriminator": [
        167,
        118,
        82,
        98,
        35,
        170,
        164,
        193
      ],
      "accounts": [
        {
          "name": "waitingSpot",
          "writable": true
        },
        {
          "name": "room",
          "writable": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "player",
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
          "name": "game",
          "type": "u8"
        },
        {
          "name": "tier",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "matchRoom",
      "discriminator": [
        184,
        98,
        136,
        79,
        180,
        97,
        245,
        79
      ]
    },
    {
      "name": "profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notImplemented",
      "msg": "Feature or instruction is not implemented yet."
    },
    {
      "code": 6001,
      "name": "invalidGame",
      "msg": "Invalid game kind."
    },
    {
      "code": 6002,
      "name": "invalidTier",
      "msg": "Invalid stake tier."
    },
    {
      "code": 6003,
      "name": "roomNotOpen",
      "msg": "Room is not open for joining."
    },
    {
      "code": 6004,
      "name": "roomNotActive",
      "msg": "Room is not active."
    },
    {
      "code": 6005,
      "name": "unauthorizedOpponent",
      "msg": "Opponent is not allowed in private room."
    },
    {
      "code": 6006,
      "name": "notAPlayer",
      "msg": "Not a player in this room."
    },
    {
      "code": 6007,
      "name": "alreadyInActiveRoom",
      "msg": "Player already has an active room."
    },
    {
      "code": 6008,
      "name": "notYourTurn",
      "msg": "Not your turn."
    },
    {
      "code": 6009,
      "name": "actionTimedOut",
      "msg": "Action submitted after deadline."
    },
    {
      "code": 6010,
      "name": "timeoutNotElapsed",
      "msg": "Timeout cannot be claimed before deadline plus grace period."
    },
    {
      "code": 6011,
      "name": "cannotCancelActiveRoom",
      "msg": "Cannot cancel room after it has started."
    },
    {
      "code": 6012,
      "name": "waitingSpotExpired",
      "msg": "Waiting spot has expired."
    },
    {
      "code": 6013,
      "name": "invalidBadge",
      "msg": "Invalid badge index."
    },
    {
      "code": 6014,
      "name": "badgeAlreadyMinted",
      "msg": "Badge already minted."
    },
    {
      "code": 6015,
      "name": "badgeRequirementNotMet",
      "msg": "Badge requirement not met."
    },
    {
      "code": 6016,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow or underflow."
    }
  ],
  "types": [
    {
      "name": "matchRoom",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "game",
            "type": "u8"
          },
          {
            "name": "tier",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "players",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "roomStatus"
              }
            }
          },
          {
            "name": "allowedOpponent",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "isQuickPlay",
            "type": "bool"
          },
          {
            "name": "firstPlayer",
            "type": "u8"
          },
          {
            "name": "createdTs",
            "type": "i64"
          },
          {
            "name": "lastActionTs",
            "type": "i64"
          },
          {
            "name": "deadlineTs",
            "type": "i64"
          },
          {
            "name": "state",
            "type": {
              "array": [
                "u8",
                1024
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "profile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wins",
            "type": "u32"
          },
          {
            "name": "losses",
            "type": "u32"
          },
          {
            "name": "draws",
            "type": "u32"
          },
          {
            "name": "rating",
            "type": "u16"
          },
          {
            "name": "streak",
            "type": "u32"
          },
          {
            "name": "bestStreak",
            "type": "u32"
          },
          {
            "name": "badges",
            "type": "u32"
          },
          {
            "name": "activeRoom",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "roomStatus",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "active"
          },
          {
            "name": "finished"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    }
  ]
};
