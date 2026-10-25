# AP4M's served config advertises a faucet host that does not resolve

**To:** Mastercard — AP4M
**Surface:** the AP4M service, `/public/config`, field `faucetUrl`

## The defect

`/public/config` returns `faucet.testevm.ripple.com` as `faucetUrl`.

That host has no DNS records.

## Receipt

```
$ nslookup faucet.testevm.ripple.com
*** can't find faucet.testevm.ripple.com: Non-existent domain

$ nslookup faucet.xrplevm.org
Addresses:  216.150.16.1
            216.150.1.1
```

`faucet.xrplevm.org` resolves and serves. It rate-limits, and returned HTTP 429
on a single first request during testing, but it is live.

## Why this blocks onboarding specifically

An AP4M agent wallet needs gas before it can transact. `faucetUrl` is the field a
developer or an automated setup step reads to get it. A host that does not resolve
fails before any rate limit, any captcha, or any error page, so there is nothing
to read and nothing to retry.

The failure also looks like a network problem on the developer's side rather than
a wrong value in a served config.

## Suggested change

Set `faucetUrl` to `faucet.xrplevm.org`, or to whichever host AP4M intends for
the XRPL EVM testnet.

## Scope

- Measured by DNS lookup on the day of the event, from one network.
- A second lookup from a different resolver returned `216.150.16.129` for
  `faucet.xrplevm.org`. The addresses differ by resolver or round-robin. Both
  lookups agree that one host answers and the other has no records.
- We did not check whether `faucet.testevm.ripple.com` ever existed.
- We did not check any other field in `/public/config`.
