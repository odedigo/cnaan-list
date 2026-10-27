import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export type SignupGate = "ok" | "denied" | "unconfigured";

const HASH_LENGTH = 32;

/** The typed password is hashed with SHA3-256 and compared with SIGNUP_PASSWORD_HASH. */
export async function signupPasswordAllowed(password: string): Promise<SignupGate> {
  const expected = (process.env.SIGNUP_PASSWORD_HASH ?? "").trim().toLowerCase();
  if (!password) return isDigestHex(expected) ? "denied" : "unconfigured";
  try {
    const digest = createHash("sha3-256").update(password).digest("hex");
    if (!isDigestHex(expected)) return "unconfigured";
    const same = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expected, "hex"));
    return same ? "ok" : "denied";
  } catch {
    return "unconfigured";
  }
}

function isDigestHex(value: string) {
  return value.length === HASH_LENGTH * 2 && /^[0-9a-f]+$/.test(value);
}
