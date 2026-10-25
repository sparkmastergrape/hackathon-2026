# Submission blueprint — what a strong demo proves

From slide 16 of the Mastercard AP4M XRPL hackathon workshop deck. Nine
checkmarks in three columns. Five-minute live demo.

## CONTROL
- PSP-attested identities
- Funded channel cap
- Over-cap attempt rejected

## PAYMENT
- HTTP 402 requirements
- Agent-signed voucher
- Immediate resource release

## PROOF
- VoucherRedeemed claim
- ClaimPaid plus SettlementRecorded
- Receipt: channel plus claim plus payout

## Which stage covers which

| Checkmark | Stage |
|---|---|
| PSP-attested identities | 01, the sign-in |
| Funded channel cap | 02 |
| Over-cap attempt rejected | 04, case three |
| HTTP 402 requirements | 03 |
| Agent-signed voucher | 03 |
| Immediate resource release | 03 |
| VoucherRedeemed claim | 05 |
| ClaimPaid plus SettlementRecorded | 05, the settle step |
| Receipt | 05 and 06 |

## Judging weights

Real-world utility 25, trust and control 25, technical execution 25, path to
production 15, demo and story 10.

Two of those four scored dimensions are about trust and control rather than the
idea, which is why stage 04 is a stage and not a footnote. The over-cap refusal
is the single clearest piece of evidence that the cap is enforced by something
other than the merchant's good manners.
