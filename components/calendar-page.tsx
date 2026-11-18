"use client";

/** Hebrew calendar section. The page is the 2net calendar, filling the space above the bottom toolbar. */

const CALENDAR_URL = "/calendar-proxy";

export function CalendarPage() {
  return (
    <iframe
      title="לוח שנה"
      src={CALENDAR_URL}
      className="block w-full border-0 bg-white"
      style={{
        height: "calc(100dvh - 3.625rem - 1px - env(safe-area-inset-bottom))",
        marginBottom: "calc(3.625rem + 1px + env(safe-area-inset-bottom) - 6rem)",
      }}
    />
  );
}
