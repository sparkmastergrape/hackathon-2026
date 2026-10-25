# Factory Configuration

Set once; each run reuses it with different inputs.

| Setting | Value |
|---|---|
| Environment | hackathon testnet (XRPL EVM) |
| Settlement asset | RLUSD |
| Budget cap | 20 RLUSD, organizer-deposited, not self-service |
| Payout mode | hackathon pool wallet (no signature required) |
| Key handling | `.env` only, gitignored, never in outputs |
| Browser automation | Claude in Chrome when paired; otherwise operator drives |
| Verification stance | claim nothing unobserved; mark reported vs verified |
| Review gate | human edits each `output/` before the next stage |
