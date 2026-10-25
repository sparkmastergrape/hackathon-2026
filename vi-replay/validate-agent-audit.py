"""Validate an `agent-audit/1` file. Exits non-zero on any error.

    py -I validate-agent-audit.py <file.json> [more.json ...]

Written for read time as well as write time. A prose rule in a spec is a
suggestion; a check that fails the load is a constraint. Shell out to this from
the display side (non-zero exit, errors on stdout) rather than trusting every
producer to have obeyed the spec.

THE RULE WORTH THE WHOLE FILE
-----------------------------
Stage `replay_refused` requires `actor: "ledger"`.

The credential layer does not refuse a replayed mandate -- that is the finding.
A credential-actor event carrying that stage would assert, in data, that the
mandate caught something it did not, which is the fused causal claim this project
removed from its pitch twice. Here it is unrepresentable rather than discouraged.

Note the rule is actor-scoped, not a ban on the stage. The ledger event
legitimately uses it, with `tx_result: "tecNO_ENTRY"`.
"""
from __future__ import annotations

import json
import re
import sys

OUTCOMES = {"ok", "refused", "unknown", "error"}
ACTORS = {"agent", "merchant", "facilitator", "device", "owner", "ledger", "credential"}
UNITS = {"drops", "XRP", "usd_cents", "USD"}
EVIDENCE = {"measured", "inferred"}
REQUIRED = ("ts", "stage", "outcome", "actor", "summary")
TS = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def check(path):
    errors, warnings = [], []

    def err(where, msg):
        errors.append("%s: %s" % (where, msg))

    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except Exception as exc:
        return ["%s: unreadable -- %s" % (path, exc)], []

    if doc.get("schema") != "agent-audit/1":
        err(path, "schema is %r, expected 'agent-audit/1'" % doc.get("schema"))
    for field in ("run_id", "network", "events"):
        if not doc.get(field):
            err(path, "envelope missing %s" % field)

    events = doc.get("events")
    if not isinstance(events, list):
        err(path, "events is not a list")
        return errors, warnings

    for i, e in enumerate(events):
        at = "%s event[%d]" % (path, i)
        if not isinstance(e, dict):
            err(at, "not an object")
            continue

        for field in REQUIRED:
            if field not in e:
                err(at, "missing required field %s" % field)
        if any(f not in e for f in REQUIRED):
            continue

        if not TS.match(str(e["ts"])):
            err(at, "ts %r is not RFC 3339 UTC ending in Z" % e["ts"])
        if e["outcome"] not in OUTCOMES:
            err(at, "outcome %r not one of %s" % (e["outcome"], sorted(OUTCOMES)))
        if e["actor"] not in ACTORS:
            err(at, "actor %r not one of %s" % (e["actor"], sorted(ACTORS)))

        summary = str(e["summary"])
        if not summary.strip():
            err(at, "summary is empty")
        elif summary.rstrip().endswith("."):
            err(at, "summary ends with a full stop: %r" % summary)
        elif "\n" in summary:
            err(at, "summary spans lines; it must be one line")

        # The rule this file exists for.
        if e["stage"] == "replay_refused" and e["actor"] != "ledger":
            err(at, "stage 'replay_refused' with actor %r. Only the ledger refuses "
                    "a replay; a %s event claiming it asserts the credential layer "
                    "caught something it did not"
                    % (e["actor"], e["actor"]))

        # A refusal is a claim about who stopped what, so it must say how it is known.
        if e["outcome"] == "refused" and "evidence" not in e:
            err(at, "outcome 'refused' requires evidence ('measured' or 'inferred')")
        if "evidence" in e and e["evidence"] not in EVIDENCE:
            err(at, "evidence %r not one of %s" % (e["evidence"], sorted(EVIDENCE)))

        # Units. An unlabelled amount is the bug the schema's first draft had.
        for field in ("amount", "ceiling"):
            if field in e and not isinstance(e[field], str):
                err(at, "%s must be a string, got %s -- a JSON number silently "
                        "rounds values that exceed float precision"
                        % (field, type(e[field]).__name__))
        if "amount" in e and "unit" not in e:
            err(at, "amount given without unit. Omit amount rather than converting "
                    "when no exact unit can be named")
        if "unit" in e and e["unit"] not in UNITS:
            err(at, "unit %r not one of %s" % (e["unit"], sorted(UNITS)))

        # Advisory: the envelope's network groups events, it does not assert any of
        # them touched that chain. Only a tx_hash signals an on-chain action.
        if e["actor"] == "ledger" and not e.get("tx_hash"):
            warnings.append("%s: ledger-actor event has no tx_hash, so nothing "
                            "establishes it happened on %s"
                            % (at, doc.get("network")))

    return errors, warnings


def main(paths):
    if not paths:
        print(__doc__.strip().splitlines()[2].strip())
        return 2

    total_err = 0
    for path in paths:
        errors, warnings = check(path)
        doc_events = 0
        try:
            with open(path, encoding="utf-8") as f:
                doc_events = len(json.load(f).get("events") or [])
        except Exception:
            pass

        if errors:
            print("FAIL %s" % path)
            for e in errors:
                print("  error: %s" % e)
        else:
            print("ok   %s  (%d events)" % (path, doc_events))
        for w in warnings:
            print("  warn : %s" % w)
        total_err += len(errors)

    print("\n%d error(s)" % total_err)
    return 1 if total_err else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
