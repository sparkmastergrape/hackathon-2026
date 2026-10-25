"""Beat: a replayed Verifiable Intent chain that passes verification.

Builds two REAL, fully signed L1/L2/L3 chains. They differ in one field:
the `conditional_transaction_id` the agent presents at L3. The owner signed
a mandate naming one transaction; the replay names another.

`verify_chain` returns valid=True on both. `check_constraints` returns
satisfied=True on both. Nothing in the credential layer refuses the replay.

Writes a JSON artifact for the display to read, so the pane never imports
this module.

    py -I vi-replay-fixture.py <lib-dir> [out.json]

ENVELOPE IS PROVISIONAL. Field names are a placeholder until the display
session confirms its event schema; `schema` carries a version so a mismatch
is detectable rather than silent.
"""
import sys, json, time, uuid, hashlib, base64

sys.path.insert(0, sys.argv[1])
OUT = sys.argv[2] if len(sys.argv) > 2 else "vi-replay-fixture.json"

from cryptography.hazmat.primitives.asymmetric import ec
import verifiable_intent as vi
from verifiable_intent.crypto.disclosure import build_selective_presentation as bsp


def b64u(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def jwk_of(p):
    n = p.public_key().public_numbers()
    return {"kty": "EC", "crv": "P-256",
            "x": b64u(n.x.to_bytes(32, "big")), "y": b64u(n.y.to_bytes(32, "big"))}


issuer, owner, agent = (ec.generate_private_key(ec.SECP256R1()) for _ in range(3))
now = int(time.time())
CAP = 500
AMOUNT = 100
GRANTED_TXID = "txn-" + str(uuid.uuid4())
REPLAYED_TXID = "txn-" + str(uuid.uuid4())

# ---- L1: the issuer credential, binding the owner key.
l1 = vi.create_layer1(vi.IssuerCredential(
    iss="https://issuer.example", sub="owner-1", iat=now, exp=now + 3600,
    cnf_jwk=jwk_of(owner), pan_last_four="4242", scheme="mastercard"), issuer)
l1_pres = l1.serialize()

# ---- L2: the owner delegates to the agent, naming a cap AND one transaction.
l2 = vi.create_layer2_autonomous(vi.UserMandate(
    nonce=str(uuid.uuid4()), aud="trustline-vi", iat=now,
    mode=vi.MandateMode.AUTONOMOUS,
    sd_hash=b64u(hashlib.sha256(l1_pres.encode("ascii")).digest()),
    payment_mandate=vi.PaymentMandate(
        cnf_jwk=jwk_of(agent), cnf_kid="agent-key-1",
        constraints=[
            vi.PaymentAmountConstraint(type="payment_amount", currency="USD", max=CAP),
            vi.ReferenceConstraint(conditional_transaction_id=GRANTED_TXID),
        ],
        payment_instrument={"id": "card-4242", "type": "card", "last_four": "4242"},
        currency="USD")), owner)

L2_SER = bsp(l2.issuer_jwt, [l2.disclosures[0], ""])
CONSTRAINTS = l2.disclosure_values[0][1]["constraints"]


def make_l3(txid):
    """The agent's final signed action. Only `transaction_id` differs."""
    return vi.create_layer3_payment(vi.PaymentL3Mandate(
        nonce=str(uuid.uuid4()), aud="trustline-vi", iat=now,
        final_payment=vi.FinalPaymentMandate(
            transaction_id=txid,
            payee={"id": "pay:dnsofmoney", "name": "DNS of Money",
                   "website": "https://dnsofmoney.com"},
            payment_amount={"currency": "USD", "amount": AMOUNT},
            payment_instrument={"id": "card-4242", "type": "card", "last_four": "4242"})),
        agent, l2_base_jwt=l2.issuer_jwt,
        payment_disclosure_b64=l2.disclosures[0], merchant_disclosure_b64="")


def assess(label, txid):
    l3 = make_l3(txid)
    chain = vi.verify_chain(l1, l2, l3_payment=l3,
                            issuer_public_key=issuer.public_key(),
                            l1_serialized=l1_pres, l2_payment_serialized=L2_SER)
    cons = vi.check_constraints(
        CONSTRAINTS,
        {"payment_amount": {"currency": "USD", "amount": AMOUNT}, "transaction_id": txid},
        mode=vi.StrictnessMode.STRICT, is_open_mandate=True)
    return {
        "case": label,
        "transaction_id_presented": txid,
        "transaction_id_granted": GRANTED_TXID,
        "reference_matches_mandate": txid == GRANTED_TXID,
        "amount": AMOUNT,
        "cap": CAP,
        "chain_signatures_valid": bool(chain.valid),
        "chain_errors": list(getattr(chain, "errors", []) or []),
        "constraints_satisfied": bool(cons.satisfied),
        "constraint_violations": list(cons.violations or []),
        "constraints_checked": list(cons.checked or []),
        "constraints_skipped": list(cons.skipped or []),
        "l3_serialized": l3.serialize() if hasattr(l3, "serialize") else None,
    }


honest = assess("honest", GRANTED_TXID)
replay = assess("replay", REPLAYED_TXID)

for r in (honest, replay):
    print("%-8s reference_ok=%-5s chain_valid=%-5s constraints_satisfied=%-5s violations=%s"
          % (r["case"], r["reference_matches_mandate"], r["chain_signatures_valid"],
             r["constraints_satisfied"], r["constraint_violations"] or "none"))

# ---- The claim this fixture exists to support.
assert honest["chain_signatures_valid"] is True, "honest chain failed; fixture is broken"
assert honest["constraints_satisfied"] is True, "honest chain refused; fixture is broken"
assert replay["reference_matches_mandate"] is False, "replay used the granted id; not a replay"
assert replay["chain_signatures_valid"] is True, \
    "verify_chain now refuses the replay -- the finding is stale, re-check the beat"
assert replay["constraints_satisfied"] is True, \
    "check_constraints now refuses the replay -- the finding is stale, re-check the beat"
assert "mandate.payment.reference" in replay["constraints_checked"], \
    "reference no longer reported as checked"
assert "mandate.payment.reference" not in replay["constraints_skipped"], \
    "reference now reported as skipped -- the blind spot became visible"

artifact = {
    "schema": "vi-replay-fixture/0.1-provisional",
    "generated_at": now,
    "finding": "mandate.payment.reference is required by verify_chain and enforced by nothing",
    "credential_layer_refuses_replay": False,
    "cases": [honest, replay],
    "note": "Both chains are fully signed and differ only in the L3 transaction_id. "
            "Enforcement must come from the ledger; the mandate does not provide it.",
}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(artifact, f, indent=2)

# ---- Second output: the shared audit schema the display pane reads.
#
# `agent-audit/1`, defined by the device session. Deliberately a separate file
# from the one above: that one keeps its own `schema` string and full detail,
# this one is the common envelope. Two version strings that can mismatch loudly
# beat one that quietly drifts.
#
# Three rules from that spec, and the reason each is obeyed here:
#  1. `outcome` reports whether the call returned a verdict, NOT whether we like
#     it. The replay verifying is the finding, so it is `ok` -- marking it
#     `refused` would put our opinion in the data.
#  2. No event here uses the `replay_attempt` outcome to imply the ledger caught
#     anything, and NONE of them is stage `replay_refused`. That stage belongs to
#     the ledger event alone. Rebuilding the fused causal claim in the data would
#     undo the thing we spent two messages taking apart.
#  3. `evidence` is mandatory on a refusal. Nothing here refuses, but every event
#     carries `measured` anyway, because all of it is observed.

AUDIT_OUT = OUT.replace(".json", "") + "-agent-audit.json"
ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))


def ev(stage, actor, outcome, summary, detail=None, amounts=False):
    e = {"ts": ts, "stage": stage, "actor": actor, "outcome": outcome,
         "evidence": "measured", "summary": summary, "asset": "USD"}
    if amounts:
        # Strings, never numbers. `unit` is named explicitly because these are
        # USD cents, not drops -- an unlabelled amount is the unit bug the
        # schema's first draft had.
        e["amount"] = str(AMOUNT)
        e["ceiling"] = str(CAP)
        e["unit"] = "usd_cents"
    if detail:
        e["detail"] = detail
    return e


def case_events(c):
    label = c["case"]
    return [
        ev("credential_verify", "credential", "ok",
           "%s chain: all three layers verify, signatures valid" % label,
           {"case": label, "chain_signatures_valid": c["chain_signatures_valid"],
            "errors": c["chain_errors"]}),
        ev("constraint_check", "credential", "ok",
           "%s chain satisfies all constraints" % label,
           {"case": label, "satisfied": c["constraints_satisfied"],
            "violations": c["constraint_violations"],
            "checked": c["constraints_checked"],
            "skipped": c["constraints_skipped"],
            "reference_matches_mandate": c["reference_matches_mandate"]},
           amounts=True),
    ]


audit = {
    "schema": "agent-audit/1",
    "run_id": "vi-replay-%d" % now,
    "network": "xrpl:1",
    "events": case_events(honest) + case_events(replay) + [
        ev("replay_attempt", "agent", "ok",
           "agent presents a signed mandate naming a transaction the owner never authorised",
           {"transaction_id_granted": GRANTED_TXID,
            "transaction_id_presented": REPLAYED_TXID,
            "credential_layer_refuses_replay": False}),
    ],
}
with open(AUDIT_OUT, "w", encoding="utf-8") as f:
    json.dump(audit, f, indent=2)

print("\nBoth chains verify. The replay is signed correctly and names a transaction")
print("the owner never authorised, and the credential layer raises nothing.")
print("Wrote %s" % OUT)
print("Wrote %s  (agent-audit/1, %d events)" % (AUDIT_OUT, len(audit["events"])))
