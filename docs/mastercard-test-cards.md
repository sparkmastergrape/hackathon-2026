# Mastercard test cards

Mastercard has **no universal test card set** — cards are per product, and some
products require a Mastercard rep to configure cards for you.

> "Mastercard does not offer a generic set of test cards that can be used across products."
> — [Test Cards for Mastercard APIs](https://developer.mastercard.com/platform/documentation/test-cards/)

The cards below are the publicly documented ones that work without a rep.

## Rules that apply to all of them

- **Expiry:** any future date works. The docs use `2077-03`.
- **CVC/CVV:** any 3 digits work. The docs use `123`.
- **Environment:** Sandbox cards only clear in Sandbox; MTF cards only in MTF.
  Sandbox credentials against a production host (or vice versa) is the most
  common cause of auth failures.
- Do not put real PANs in any test environment.

## Mastercard Send / Move — Sandbox

Source: [Sandbox Test Cards](https://developer.mastercard.com/mastercard-send/documentation/implementation/sandbox-test-cards/)

### Consumer

| Network | PANs |
| --- | --- |
| Mastercard (Debit) | 5102589999999913, 5102589999999921, 5102589999999939, 5102589999999947, 5102589999999954 |
| Maestro (Debit) | 4024140000000008, 4024140000000016, 4024140000000024, 4024140000000032, 4024140000000040 |
| Mastercard MoneySend | 5107559999999903, 5107559999999911, 5107559999999929, 5107559999999937, 5107559999999945 |
| STAR | 5008539999999905, 5008539999999913, 5008539999999921, 5008539999999939, 5008539999999947 |
| Pulse | 6029879999999908, 6029879999999916, 6029879999999924, 6029879999999932, 6029879999999940 |
| NYCE | 5015658742698217, 5015657236952411, 5015653433952312, 5015654433952310, 5015654323952313 |
| VISA OCT/AFT (Prepaid) | 4000289999999908, 4000289999999916, 4000289999999924, 4000289999999932, 4000289999999940 |
| VISA OCT/AFT (Debit) | 4007589999999904, 4007589999999912, 4007589999999920, 4007589999999938, 4007589999999946 |
| MoneySend DM | 5102640000000017, 5102640000000025, 5102640000000033, 5102640000000041, 5102640000000058 |
| MoneySend Funding DM | 5102670000000030, 5102670000000048, 5102670000000055, 5102670000000063, 5102670000000071 |
| MoneySend Funding SM | 5102680000000039, 5102680000000047, 5102680000000054, 5102680000000062, 5102680000000070 |

### Commercial

| Network | PANs |
| --- | --- |
| Mastercard (Debit) | 5199770000000008, 5017140000000004, 5477520000000018, 5022300000000007, 5574400000000015 |
| MoneySend (Debit) | 5809780000000009, 5827150000000011, 5870660000000007, 5842310000000004, 5894410000000009 |
| VISA OCT/AFT (Debit) | 4000730000000004, 4013530000000003 |
| STAR (Debit) | 4000700000000007, 4013500000000006, 5990660000000010, 5617150000000007, 5199780000000007 |
| NYCE (Debit) | 4000710000000006, 4013510000000005, 5970660000000014, 5627150000000005, 5209780000000005 |
| PULSE (Debit) | 4000720000000005, 4013520000000004, 5770660000000008, 5727150000000004, 5309780000000004 |
| MoneySend DM | 5204750000000003, 5204750000000011, 5204750000000029, 5204750000000037, 5204750000000045 |
| MoneySend Funding DM | 2223011200000002, 2223011200000010, 2223011200000028, 2223011200000036, 2223011200000044 |
| MoneySend Funding SM | 5541030000000002, 5541030000000010, 5541030000000028, 5541030000000036, 5541030000000044 |

## Forcing a settlement-speed response

Useful if a demo needs to show a pending payout rather than an instant one.
Source: [MPQR test card numbers](https://developer.mastercard.com/mastercard-merchant-presented-qr/documentation/server-apis/test-card-numbers/)

| PAN | Funds availability |
| --- | --- |
| 5000333641352301 | Next business day |
| 5000361001156749 | Two to five business days |
| any other published test PAN | Immediate |

## Commercial PANs by country (Sandbox + MTF)

MPQR publishes commercial debit PANs per country — handy for a cross-border
demo. The full table is on the
[MPQR test card numbers page](https://developer.mastercard.com/mastercard-merchant-presented-qr/documentation/server-apis/test-card-numbers/).
A few examples:

| Country | Consumer | Commercial |
| --- | --- | --- |
| India | 5299920000000149, 5299920210000277 | 5299926000000542, 5299926000000658 |
| Singapore | 5204881040000222, 5204881040000263 | 5204880350000095, 5204880350000152 |
| Hong Kong | 5982761200000006, 5982761200000014 | — |
| Vietnam | 5463070230000335, 5463070010000380 | 5463070430000135, 5463070430001307 |

Note the MPQR page's own warning: do not use consumer card numbers in the test
environment, and MTF transactions are not executed against other networks.

## MTF spreadsheets

Mastercard Send publishes full MTF PAN lists as spreadsheets rather than tables:

- [Test_Cards_US_MTF.xlsx](https://static.developer.mastercard.com/content/mastercard-send/uploads/Test_Cards_US_MTF.xlsx)
- [Test_Cards_MTF.xlsx](https://static.developer.mastercard.com/content/mastercard-send/uploads/Test_Cards_MTF.xlsx) (rest of world)

## Products whose test cards live elsewhere

These need a Mastercard Checkout Solutions sandbox before the cards are usable:

| Product | Test cards |
| --- | --- |
| Click to Pay | [test cards](https://developer.mastercard.com/mastercard-checkout-solutions/documentation/testing/test_cases/click_to_pay_case/#test-cards) |
| Secure Card on File | [test cards](https://developer.mastercard.com/mastercard-checkout-solutions/documentation/testing/test_cases/secure_card_on_file/#test-cards) |
| Merchant Presented QR: SRC | [test cards](https://developer.mastercard.com/mastercard-checkout-solutions/documentation/testing/test_cases/ma_merchant_presented_qr/#test-cards) |
| Guest Checkout Tokenization | [test cards](https://developer.mastercard.com/mastercard-checkout-solutions/documentation/testing/test_cases/guest_checkout_tokenization/#test-cards) |
| Virtual Card Tokens | [test cards](https://developer.mastercard.com/mastercard-checkout-solutions/documentation/testing/test_cases/mastercard_virtualcard_tokens/#test-cards) |

For any other API: contact your Mastercard rep or
[API Support](https://developer.mastercard.com/support).
