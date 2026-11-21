// Local check for the Kurier integration with a mocked fetch.
// No real API key, no network: validates register-vk payload, optimisticVerify
// gating, that submitToKurier returns ONLY at Finalized (an IncludedInBlock
// txHash alone must not end the wait — Round 4 scored 0 verified that way),
// and the budget-exhausted paths.
import { registerVk, submitToKurier } from "../src/prover.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

const calls = [];
function mockFetch(responses) {
  let i = 0;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null });
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.ok !== false, status: r.status || 200, json: async () => r.json };
  };
}

const VK = { protocol: "groth16", curve: "bn128", nPublic: 13 };

// 1. register-vk posts the full vk object and returns the vkHash.
mockFetch([{ json: { vkHash: "0xdeadbeef" } }]);
const reg = await registerVk(VK, "key-123");
check("register-vk returns vkHash", reg.vkHash === "0xdeadbeef");
check(
  "register-vk payload carries full vk + groth16/snarkjs/bn128",
  calls[0].url.endsWith("/register-vk/key-123") &&
    calls[0].body.proofType === "groth16" &&
    JSON.stringify(calls[0].body.vk) === JSON.stringify(VK) &&
    calls[0].body.proofOptions.library === "snarkjs"
);

// 2. submit-proof -> returns ONLY at Finalized, with the finalized txHash.
//    The IncludedInBlock stage carries a different (early) txHash on purpose:
//    if the wait ended there, this check fails.
mockFetch([
  { json: { jobId: "job-1", optimisticVerify: "success" } },
  { json: { jobId: "job-1", status: "Submitted" } },
  { json: { jobId: "job-1", status: "IncludedInBlock", txHash: "0xearly" } },
  { json: { jobId: "job-1", status: "Finalized", txHash: "0xfinal" } },
]);
const ok = await submitToKurier({ pi_a: ["1"] }, ["2"], "0xvk", "key-123", 30000);
check("submit returns at Finalized with its txHash", ok.finalized === true && ok.txHash === "0xfinal", `got status=${ok.status} tx=${ok.txHash}`);
check("submit payload uses vkRegistered + vk hash", calls[1].body.vkRegistered === true && calls[1].body.proofData.vk === "0xvk");

// 3. optimisticVerify != success throws (bad proof artifacts never finalize).
mockFetch([{ json: { jobId: "job-2", optimisticVerify: "failed" } }]);
let threw = false;
try {
  await submitToKurier({ pi_a: ["1"] }, ["2"], "0xvk", "key-123", 30000);
} catch (e) {
  threw = /optimisticVerify/.test(e.message);
}
check("optimisticVerify failure throws", threw);

// 4a. Stuck at IncludedInBlock until the budget ends -> finalized false
//     (caller still returns the proof; txHash kept for logging).
mockFetch([
  { json: { jobId: "job-3", optimisticVerify: "success" } },
  { json: { jobId: "job-3", status: "IncludedInBlock", txHash: "0xearly" } },
]);
const slow = await submitToKurier({ pi_a: ["1"] }, ["2"], "0xvk", "key-123", 4500);
check("unfinalized at budget end returns finalized=false", slow.finalized === false && slow.status === "IncludedInBlock", `status=${slow.status}`);

// 4b. No status ever arrives within a tiny budget -> txHash null.
mockFetch([
  { json: { jobId: "job-4", optimisticVerify: "success" } },
  { json: { jobId: "job-4", status: "Submitted" } },
]);
const none = await submitToKurier({ pi_a: ["1"] }, ["2"], "0xvk", "key-123", 100);
check("no anchor within budget returns txHash null", none.txHash === null && none.finalized === false, `status=${none.status}`);

// 5. Stall race: first job wedged at Submitted -> a second submission of the
//    same proof is fired after stallMs, and its Finalized wins the race.
let submitCount = 0;
globalThis.fetch = async (url) => {
  if (url.includes("/submit-proof/")) {
    submitCount++;
    return { ok: true, status: 200, json: async () => ({ jobId: `stall-${submitCount}`, optimisticVerify: "success" }) };
  }
  if (url.includes("/job-status/") && url.endsWith("stall-1")) {
    return { ok: true, status: 200, json: async () => ({ jobId: "stall-1", status: "Submitted" }) };
  }
  if (url.includes("/job-status/") && url.endsWith("stall-2")) {
    return { ok: true, status: 200, json: async () => ({ jobId: "stall-2", status: "Finalized", txHash: "0xraced" }) };
  }
  throw new Error("unexpected fetch " + url);
};
const raced = await submitToKurier({ pi_a: ["1"] }, ["2"], "0xvk", "key-123", 20000, 3000);
check("stalled first job triggers a second submission", submitCount === 2, `submits=${submitCount}`);
check("second job's Finalized wins the race", raced.finalized === true && raced.txHash === "0xraced", `status=${raced.status} tx=${raced.txHash}`);

console.log(failures === 0 ? "\nAll Kurier checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
