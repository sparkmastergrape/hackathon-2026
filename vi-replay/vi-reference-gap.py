"""The ten-second gap: a required VI constraint that verification reports as
checked, and enforces not at all.

    py -I vi-reference-gap.py C:/Users/JD/AppData/Local/Temp/vis

No network, no signing, no keys. Two constraints, one presented payment.
"""
import sys
sys.path.insert(0, sys.argv[1])
import verifiable_intent as vi

GRANTED_TXID = "TXID-the-user-actually-authorised"
REPLAYED_TXID = "TXID-something-else-entirely"

constraints = [
    vi.PaymentAmountConstraint(type="payment_amount", currency="USD", max=500).to_dict(),
    vi.ReferenceConstraint(conditional_transaction_id=GRANTED_TXID).to_dict(),
]

print("The owner signed a mandate carrying two constraints:")
for c in constraints:
    print("   ", c["type"])

def present(label, amount, txid):
    r = vi.check_constraints(
        constraints,
        {"payment_amount": {"currency": "USD", "amount": amount}, "transaction_id": txid},
        mode=vi.StrictnessMode.STRICT, is_open_mandate=True)
    print("\n%s" % label)
    print("   amount         : %s" % amount)
    print("   transaction_id : %s" % txid)
    print("   -> satisfied   : %s" % r.satisfied)
    print("      violations  : %s" % (r.violations or "none"))
    print("      checked     : %s" % r.checked)
    print("      skipped     : %s" % (r.skipped or "none"))
    return r

a = present("A. Honest agent. Within cap, correct reference.", 100, GRANTED_TXID)
b = present("B. Over the cap. The amount constraint does work.", 900, GRANTED_TXID)
r = present("C. REPLAY. Cap respected, reference wrong.", 100, REPLAYED_TXID)

print("\n" + "-" * 68)

# Case A: the baseline must pass, or the fixture itself is wrong.
assert a.satisfied is True, "baseline failed; the fixture is broken, not the library"

# Case B is the CONTROL, and it carries its own asserts for a reason. If a
# later version broke amount_range, B would quietly start passing and this
# script would still exit 0 -- lying in exactly the direction it exists to
# prevent. So assert the refusal AND the message.
assert b.satisfied is False, "the amount cap stopped being enforced; the control is dead"
assert any("exceeds maximum" in v for v in b.violations), \
    "amount cap refused without naming the overage; check the violation text"

# Case C: the finding. These three fire if the gap is ever closed.
assert "mandate.payment.reference" in r.checked, "reference no longer reported as checked"
assert "mandate.payment.reference" not in (r.skipped or []), "reference now reported as skipped"
assert r.satisfied is True, "the reference constraint is enforced now -- the finding is stale"

print("Case C passes. The checker reports it CHECKED the reference constraint,")
print("reports NOTHING skipped, and raises no violation on a reference that does")
print("not match the one the owner signed.")
print()
print("Case B is the control. The same checker, on the same call, refuses the")
print("over-cap payment. So C is not 'the checker does nothing'.")
print()
print("`mandate.payment.reference` is required by verify_chain and enforced by")
print("nothing. A caller auditing `skipped` to find its blind spots will not")
print("find this one.")
print()
print("All three cases are asserted. If any of this changes, this script fails.")
