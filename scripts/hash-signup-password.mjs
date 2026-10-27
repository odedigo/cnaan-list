import { createHash } from "node:crypto";

const password = process.argv[2] ?? "";
if (!password) {
  console.error("Usage: node scripts/hash-signup-password.mjs <registration-password>");
  process.exit(1);
}

process.stdout.write(`${createHash("sha3-256").update(password).digest("hex")}\n`);
