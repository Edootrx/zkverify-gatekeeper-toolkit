// End-to-end proof check: for each scenario, the decision from decision.js
// must be PROVABLE by the real gatekeeper circuit (fullProve must succeed),
// and the opposite decision must FAIL to prove. This mirrors the platform:
// it re-verifies the proof against its registered VK.
// Run: npm run test:proof
import * as snarkjs from "snarkjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "../src/decision.js";
import { buildCircuitInput } from "../src/prover.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM = path.join(ROOT, "circuits", "gatekeeper.wasm");
const ZKEY = path.join(ROOT, "circuits", "gatekeeper_final.zkey");

const VALID = {
  registered_vk: "0x7d3af291",
  proof_vk: "0x7d3af291",
  minimum: "1000",
  public_balance: "1460",
  expiry_block: 19842201,
  current_block: 19832000,
  recipient: "0xDe429f01",
  condition_recipient: "0xDe429f01",
  amount: "500",
  max_transfer: "1000",
  proof_tx: "0xa4c18ff1",
};

const scenarios = [
  ["valid", VALID],
  ["vk trap", { ...VALID, proof_vk: "0xa4c1b8ff", proof_tx: "0x11" }],
  ["threshold trap", { ...VALID, public_balance: "10", proof_tx: "0x12" }],
  ["expired trap", { ...VALID, current_block: 19842201, proof_tx: "0x13" }],
  ["recipient trap", { ...VALID, recipient: "0xbeef", proof_tx: "0x14" }],
  ["amount trap", { ...VALID, amount: "5000", proof_tx: "0x15" }],
];

let pass = 0, fail = 0;
for (const [name, input] of scenarios) {
  const task = { task_id: "gk_test_1", input };
  const verdict = decide(input, new Set());
  const ci = buildCircuitInput(task, verdict, { secret: "test-secret", taskIdEncoding: "bytes" });
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(ci, WASM, ZKEY);
    const vk = await snarkjs.zKey.exportVerificationKey(ZKEY);
    const verified = await snarkjs.groth16.verify(vk, publicSignals, proof);
    console.log(`${verified ? "PASS" : "FAIL"}  ${name}: decision ${verdict.decision} provable & verifies=${verified}`);
    verified ? pass++ : fail++;
  } catch (e) {
    console.log(`FAIL  ${name}: fullProve threw ${String(e.message || e).slice(0, 100)}`);
    fail++;
  }
  // Opposite decision must NOT be provable
  const opp = { decision: verdict.decision === "APPROVE" ? "REJECT" : "APPROVE" };
  const ciOpp = buildCircuitInput(task, opp, { secret: "test-secret", taskIdEncoding: "bytes" });
  try {
    await snarkjs.groth16.fullProve(ciOpp, WASM, ZKEY);
    console.log(`FAIL  ${name}: opposite decision was provable (circuit does not bind decision!)`);
    fail++;
  } catch {
    console.log(`PASS  ${name}: opposite decision correctly unprovable`);
    pass++;
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
