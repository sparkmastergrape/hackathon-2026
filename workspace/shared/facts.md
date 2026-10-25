# Shared Facts (public identifiers)

Source: participant space, captured 2026-10-24. Public values only — no keys.

## Endpoints

| Item | Value |
|---|---|
| AP4M API URL | `https://hackathon.ap4m.build` |
| Participant space | `https://hackathon.ap4m.build/participant` |

## Wallets

| Role | Address |
|---|---|
| Agent wallet (signs every payment, holds XRP for gas) | `0x37f2f4166646ea3cea94bb37babd88a01f52a7a2` |

Hackathon pool payout wallets offered (choose one, no signature needed):

| Label | Address |
|---|---|
| Merchant Test Account 1 | `0xc46d99faae8482f3876f49cae56b9f09057ce2b8` |
| Merchant Test Account 2 | `0x168c38bad878eda9831b5fa29d8b2f0a4cd13721` |
| Merchant Test Account 3 | `0x5fbe097290e4354d665119dd5cf1c8a92947118a` |
| Merchant Test Account 4 | `0x611692800cfac3eb58d69c329d592e35ab552b4d` |

## Budget

| Field | Value |
|---|---|
| Cap | 20 RLUSD, deposited by the organizer |
| Used | — |
| Remaining | — |

## Mechanism

Verified merchant. EIP-712 voucher. RLUSD settlement on XRPL EVM. Sign-in to the
participant space is a team name plus the funding or agent wallet address; the
wallet signs a one-time message and nothing is sent on-chain.
