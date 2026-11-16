"use server";

import { isAccountRole, isUserType } from "@/lib/account-role";
import { sendManagedPasswordReset, updateManagedAccount } from "@/lib/admin-accounts";

export async function saveManagedAccount(userId: string, role: string, userType: string, eventReminders: boolean) {
  if (!isAccountRole(role)) return { error: "תפקיד אינו תקין" };
  if (!isUserType(userType)) return { error: "סוג המשתמש אינו תקין" };
  return updateManagedAccount(userId, role, userType, eventReminders);
}

export async function resetManagedPassword(userId: string) {
  return sendManagedPasswordReset(userId);
}
