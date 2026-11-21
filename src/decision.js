// Deterministic Proof Gatekeeper decision logic.
// NO language model in this path — pure field checks, in trap-priority order.
//
// Circuit-verified semantics (tested locally against gatekeeper.wasm, 2026-11-15):
//  - decision = 1 (APPROVE) is only provable when EVERY check passes.
//  - Expiry is STRICT: currentBlock == expiryBlock already fails the circuit
//    (GreaterThan, not GreaterEqThan) -> EXPIRED when currentBlock >= expiryBlock.
//  - Balance and amount boundaries are inclusive: balance == minimum passes,
//    amount == maxTransfer passes.
//  - The circuit has NO reuse input: PROOF_REUSED is a local seen-set check only,
//    and reused tasks are excluded from the proof requirement by the platform.

export const REASONS = {
  VALID: "VALID_CONDITION",
  VK: "VK_SUBSTITUTION",
  THRESHOLD: "THRESHOLD_MISMATCH",
  REUSED: "PROOF_REUSED",
  EXPIRED: "EXPIRED_CONDITION",
  RECIPIENT: "RECIPIENT_MISMATCH",
  AMOUNT: "AMOUNT_OVERFLOW",
};

function normHex(v) {
  if (v === undefined || v === null) return null;
  return String(v).trim().toLowerCase();
}

function toBig(v) {
  if (v === undefined || v === null || v === "") return null;
  try {
    return BigInt(v);
  } catch {
    return null;
  }
}

// input: task.input object. seen: Set of proof_tx strings already accepted/seen.
// Returns { decision, reason_code, checks } — checks is for logging/debugging only.
export function decide(input, seen) {
  const checks = {};

  const proofTx = normHex(input.proof_tx);
  checks.reused = proofTx !== null && seen.has(proofTx);
  if (checks.reused) {
    return { decision: "REJECT", reason_code: REASONS.REUSED, checks, provable: false };
  }

  const registeredVk = normHex(input.registered_vk);
  const proofVk = normHex(input.proof_vk);
  checks.vkMatch = registeredVk !== null && proofVk !== null && registeredVk === proofVk;
  if (!checks.vkMatch) {
    return { decision: "REJECT", reason_code: REASONS.VK, checks, provable: true };
  }

  const minimum = toBig(input.minimum);
  const balance = toBig(input.public_balance);
  checks.thresholdOk = minimum !== null && balance !== null && balance >= minimum;
  if (!checks.thresholdOk) {
    return { decision: "REJECT", reason_code: REASONS.THRESHOLD, checks, provable: true };
  }

  const expiry = toBig(input.expiry_block);
  const current = toBig(input.current_block);
  // Strict: must be current < expiry (circuit-verified).
  checks.notExpired = expiry !== null && current !== null && current < expiry;
  if (!checks.notExpired) {
    return { decision: "REJECT", reason_code: REASONS.EXPIRED, checks, provable: true };
  }

  const recipient = normHex(input.recipient);
  const condRecipient = normHex(input.condition_recipient);
  checks.recipientOk =
    recipient !== null && condRecipient !== null && recipient === condRecipient;
  if (!checks.recipientOk) {
    return { decision: "REJECT", reason_code: REASONS.RECIPIENT, checks, provable: true };
  }

  const amount = toBig(input.amount);
  const maxTransfer = toBig(input.max_transfer);
  checks.amountOk = amount !== null && maxTransfer !== null && amount <= maxTransfer;
  if (!checks.amountOk) {
    return { decision: "REJECT", reason_code: REASONS.AMOUNT, checks, provable: true };
  }

  return { decision: "APPROVE", reason_code: REASONS.VALID, checks, provable: true };
}
