import sys, time, uuid, hashlib, base64
sys.path.insert(0, sys.argv[1])
from cryptography.hazmat.primitives.asymmetric import ec
import verifiable_intent as vi
from verifiable_intent.crypto.disclosure import build_selective_presentation as bsp

def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip("=")
def jwk_of(p):
    n = p.public_key().public_numbers()
    return {"kty":"EC","crv":"P-256","x":b64u(n.x.to_bytes(32,"big")),"y":b64u(n.y.to_bytes(32,"big"))}

issuer, user, agent = (ec.generate_private_key(ec.SECP256R1()) for _ in range(3))
now  = int(time.time())
txid = str(uuid.uuid4())          # minted first: L2 references it, L3 reuses it

l1 = vi.create_layer1(vi.IssuerCredential(
    iss="https://issuer.example", sub="user-123", iat=now, exp=now+3600,
    cnf_jwk=jwk_of(user), pan_last_four="4242", scheme="mastercard"), issuer)
l1_pres = l1.serialize()

def make_l2(max_cents):
    return vi.create_layer2_autonomous(vi.UserMandate(
        nonce=str(uuid.uuid4()), aud="trustline-vi", iat=now,
        mode=vi.MandateMode.AUTONOMOUS,
        sd_hash=b64u(hashlib.sha256(l1_pres.encode("ascii")).digest()),
        payment_mandate=vi.PaymentMandate(
            cnf_jwk=jwk_of(agent), cnf_kid="agent-key-1",
            constraints=[
                vi.PaymentAmountConstraint(type="payment_amount", currency="USD", max=max_cents),
                vi.ReferenceConstraint(conditional_transaction_id=txid),
            ],
            payment_instrument={"id":"card-4242","type":"card","last_four":"4242"}, currency="USD",
        )), user)

def make_l3(l2, value_cents, tid=None):
    return vi.create_layer3_payment(vi.PaymentL3Mandate(
        nonce=str(uuid.uuid4()), aud="trustline-vi", iat=now,
        final_payment=vi.FinalPaymentMandate(
            transaction_id=tid or txid, payee={"id":"pay:dnsofmoney","name":"DNS of Money","website":"https://dnsofmoney.com"},
            payment_amount={"currency":"USD","amount":value_cents},
            payment_instrument={"id":"card-4242","type":"card","last_four":"4242"})),
        agent, l2_base_jwt=l2.issuer_jwt,
        payment_disclosure_b64=l2.disclosures[0], merchant_disclosure_b64="")

def check(label, l2, l3):
    r = vi.verify_chain(l1, l2, l3_payment=l3, issuer_public_key=issuer.public_key(),
        l1_serialized=l1_pres,
        l2_payment_serialized=bsp(l2.issuer_jwt, [l2.disclosures[0], ""]))
    ok = getattr(r, "valid", None)
    print("%-28s valid=%s  %s" % (label, ok, (getattr(r,"errors",None) or "")))
    return r

l2 = make_l2(500)
check("happy path (100 <= 500)", l2, make_l3(l2, 100))
check("over L2 limit (900 > 500)", l2, make_l3(l2, 900))
check("wrong transaction_id",      l2, make_l3(l2, 100, tid=str(uuid.uuid4())))

# ---- constraints are a SEPARATE call. verify_chain does not enforce them.
print("\n=== check_constraints (the spend cap lives here) ===")
l2_constraints = l2.disclosure_values[0][1]["constraints"]
def enforce(label, value_cents, tid):
    r = vi.check_constraints(
        l2_constraints,
        {"payment_amount": {"currency": "USD", "amount": value_cents},
         "transaction_id": tid},
        mode=vi.StrictnessMode.STRICT, is_open_mandate=True)
    print("%-28s satisfied=%s  violations=%s" % (label, r.satisfied, r.violations))
enforce("within cap (100 <= 500)", 100, txid)
enforce("over cap  (900 > 500)",   900, txid)
enforce("wrong transaction_id",    100, str(uuid.uuid4()))

print("\n=== what the checker actually inspected ===")
r = vi.check_constraints(l2_constraints,
    {"payment_amount": {"currency":"USD","amount":100}, "transaction_id": "totally-wrong"},
    mode=vi.StrictnessMode.STRICT, is_open_mandate=True)
print("constraints present:", [c.get("type") for c in l2_constraints])
print("checked :", r.checked)
print("skipped :", r.skipped)
print("satisfied:", r.satisfied, "violations:", r.violations)
