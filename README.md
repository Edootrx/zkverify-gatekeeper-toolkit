# Gatekeeper Agent Testing Toolkit

Test harnesses for zkVerify Agent Games **Proof Gatekeeper** agents, extracted
from a live competition agent (crionic-gatekeeper) that played all six scored
rounds of Season 01. Validate your agent locally — decisions, proofs, and
on-chain anchoring — *before* you register it and burn scored rounds on bugs a
unit test would have caught.

## The three harnesses

### 1. Decision simulator — `test/simulate.mjs` · `npm test`
Offline checks of your decision logic against every documented trap type,
plus the boundary cases that decide real rounds:

| Case | Expected |
| --- | --- |
| Valid condition | APPROVE |
| VK substitution | REJECT |
| Threshold mismatch / boundary (balance == minimum) | REJECT / APPROVE |
| Expired (current > expiry) / boundary (current == expiry, circuit-strict) | REJECT |
| Recipient mismatch (case-insensitive compare) | REJECT |
| Amount overflow / boundary (amount == max) | REJECT / APPROVE |
| Proof reuse (proof_tx in seen-set) | REJECT |
| Amounts beyond float53 (BigInt-safe) | correct verdict |
| Missing fields | REJECT (fail closed) |

12 checks, no network, no circuit artifacts needed.

### 2. Circuit provability checker — `test/proof-check.mjs` · `npm run test:proof`
End-to-end with the **real gatekeeper circuit** (snarkjs `fullProve` against
`gatekeeper.wasm` + `gatekeeper_final.zkey`). For each scenario it asserts:

- the decision your logic chose **is provable** and verifies against the VK, and
- the **opposite decision is unprovable** — the circuit binds the decision to
  the checks, so a wrong verdict cannot be proven.

This mirrors the platform, which re-verifies your proof against its registered
VK. 12 checks (6 scenarios × both directions).

### 3. Kurier integration suite — `test/kurier-check.mjs`
Mocked-`fetch` tests of the Kurier anchoring flow — no API key, no network:

- register-vk posts the full VK with `groth16 / snarkjs / bn128` options;
- a non-`success` `optimisticVerify` throws (bad artifacts never anchor);
- submission returns **only at Finalized** — an IncludedInBlock tx hash must
  not end the wait;
- budget-exhausted paths return the proof anyway, with `finalized: false`;
- **anti-stall race**: if the first job wedges at `Submitted`, a second
  submission of the same proof fires and its Finalized wins.

9 checks encoding the exact failure modes that cost real points in Season 01.

## Quickstart

```bash
npm install
npm test            # decision simulator
npm run test:proof  # circuit provability (needs circuit artifacts, below)
node test/kurier-check.mjs
```

## Requirements

- Node.js 18+
- `snarkjs` (dev dependency)
- For the provability checker: the gatekeeper circuit artifacts
  (`gatekeeper.wasm`, `gatekeeper_final.zkey`) in `circuits/` — downloadable
  from the Agent Games site.

## Adapting it to your agent

The harnesses import two functions from the reference agent: `decide()` (pure
decision logic returning `{decision, reason_code}`) and `buildCircuitInput()`
(circuit input builder). Point the imports at your own modules with the same
shapes and the suites run unchanged.

## Lessons baked in

- Answer only after **Finalized**, and read `deadline_at` from the task
  envelope (competition 60s, practice 15s) instead of assuming.
- Persist your proof-reuse seen-set across deploys — replay traps recur
  across rounds.
- Log every Kurier tx hash per task; your score log is the ground truth when
  something disagrees.

## License

MIT
