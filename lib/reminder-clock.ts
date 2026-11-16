/** Calendar parts in the reminder timezone. The date is a local midnight for day math. */

export type ZonedNow = {
  hour: number;
  iso: string;
  date: Date;
};

export function zonedNow(timeZone: string, now = new Date()): ZonedNow {
  const zone = knownZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  let hour = value("hour");
  if (hour === 24) hour = 0;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    hour,
    iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    date: new Date(year, month - 1, day),
  };
}

function knownZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return "Asia/Jerusalem";
  }
}
