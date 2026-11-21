// Offline simulation: every documented trap type + valid + boundary cases.
// Run: npm test
import { decide, REASONS } from "../src/decision.js";

const VALID = {
  registered_vk: "0x7d3af291",
  proof_vk: "0x7d3af291",
  minimum: "1000",
  public_balance: "1460",
  expiry_block: 19842201,
  current_block: 19832000,
  recipient: "0xDe429f01",
  condition_recipient: "0xde429f01", // case difference must NOT matter
  amount: "500",
  max_transfer: "1000",
  proof_tx: "0xa4c18ff1",
};

let pass = 0, fail = 0;
function check(name, input, seen, wantDecision, wantReason) {
  const v = decide(input, seen || new Set());
  const ok = v.decision === wantDecision && v.reason_code === wantReason;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -> ${v.decision}/${v.reason_code}`);
  ok ? pass++ : fail++;
}

check("valid condition", VALID, null, "APPROVE", REASONS.VALID);
check("vk substitution", { ...VALID, proof_vk: "0xa4c1b8ff", proof_tx: "0x01" }, null, "REJECT", REASONS.VK);
check("threshold mismatch", { ...VALID, public_balance: "999", proof_tx: "0x02" }, null, "REJECT", REASONS.THRESHOLD);
check("threshold boundary == minimum", { ...VALID, public_balance: "1000", proof_tx: "0x03" }, null, "APPROVE", REASONS.VALID);
check("expired (current > expiry)", { ...VALID, current_block: 19842202, proof_tx: "0x04" }, null, "REJECT", REASONS.EXPIRED);
check("expired boundary (current == expiry, circuit-strict)", { ...VALID, current_block: 19842201, proof_tx: "0x05" }, null, "REJECT", REASONS.EXPIRED);
check("recipient mismatch", { ...VALID, recipient: "0xbeefbeef", proof_tx: "0x06" }, null, "REJECT", REASONS.RECIPIENT);
check("amount overflow", { ...VALID, amount: "1001", proof_tx: "0x07" }, null, "REJECT", REASONS.AMOUNT);
check("amount boundary == max", { ...VALID, amount: "1000", proof_tx: "0x08" }, null, "APPROVE", REASONS.VALID);
check("proof reused", VALID, new Set(["0xa4c18ff1"]), "REJECT", REASONS.REUSED);
check("big numbers beyond float53", { ...VALID, minimum: "9007199254740993000", public_balance: "9007199254740993001", proof_tx: "0x09" }, null, "APPROVE", REASONS.VALID);
check("missing fields fail closed", { proof_tx: "0x0a" }, null, "REJECT", REASONS.VK);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
