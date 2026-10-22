export const USERNAME_PATTERN = /^[A-Za-z0-9_\u0590-\u05FF]{3,24}$/;

export function usernameError(value: string) {
  const username = value.trim();
  if (!USERNAME_PATTERN.test(username)) {
    return "שם המשתמש חייב להכיל 3 עד 24 תווים: עברית, אנגלית, ספרות או קו תחתון";
  }
  return null;
}

export function passwordError(value: string) {
  if (value.length < 8) {
    return "הסיסמה חייבת להכיל לפחות 8 תווים";
  }
  return null;
}

export function emailError(value: string) {
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "כתובת האימייל אינה תקינה";
  }
  return null;
}
