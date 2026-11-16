import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import { generateVAPIDKeys } from "web-push";

const path = ".env.local";
const current = existsSync(path) ? readFileSync(path, "utf8") : "";
if (current.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY=")) {
  console.log("reminder env already present");
  process.exit(0);
}

const keys = generateVAPIDKeys();
const secret = randomBytes(32).toString("hex");
appendFileSync(
  path,
  [
    "",
    "# Daily event reminders for the installed app.",
    "EVENT_REMINDER_HOUR=9",
    "EVENT_REMINDER_DAYS=3",
    "EVENT_REMINDER_TIMEZONE=Asia/Jerusalem",
    "VAPID_SUBJECT=mailto:reminders@cnaanlist.local",
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`,
    `VAPID_PRIVATE_KEY=${keys.privateKey}`,
    `CRON_SECRET=${secret}`,
    "",
  ].join("\n"),
);
console.log("reminder env added");
