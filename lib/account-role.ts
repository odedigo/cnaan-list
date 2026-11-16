export type AccountRole = "USER" | "ADMIN";

export type UserType = "NORM" | "PRO" | "PREMIUM";

export type ManagedAccount = {
  userId: string;
  username: string;
  email: string;
  role: AccountRole;
  userType: UserType;
  accountId: string | null;
  eventReminders: boolean;
};

export const userTypeOptions: { value: UserType; label: string }[] = [
  { value: "NORM", label: "רגיל" },
  { value: "PRO", label: "פרו" },
  { value: "PREMIUM", label: "פרימיום" },
];

export function isAccountRole(value: string): value is AccountRole {
  return value === "USER" || value === "ADMIN";
}

export function isUserType(value: string): value is UserType {
  return value === "NORM" || value === "PRO" || value === "PREMIUM";
}

export function userTypeLabel(value: string) {
  return userTypeOptions.find((item) => item.value === value)?.label ?? "רגיל";
}

export function recipeAiAllowed(userType: unknown) {
  return userType === "PRO" || userType === "PREMIUM";
}
