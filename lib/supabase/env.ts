export function isProduction() {
  return process.env.PRODUCTION === "true";
}

export function supabaseUrl() {
  return (isProduction() ? process.env.NEXT_PUBLIC_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL_DEV) ?? "";
}

export function supabaseAnonKey() {
  return (isProduction() ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV) ?? "";
}
