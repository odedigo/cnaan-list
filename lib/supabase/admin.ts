import "server-only";

import { createClient } from "@supabase/supabase-js";

import { isProduction, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

function supabaseServiceRoleKey() {
  return (isProduction() ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY_DEV) ?? "";
}

export function hasServiceEnv() {
  return Boolean(supabaseUrl() && supabaseAnonKey() && supabaseServiceRoleKey());
}

export function createAdminClient() {
  return createClient(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
