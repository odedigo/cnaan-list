import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export function hasPublicEnv() {
  return Boolean(supabaseUrl() && supabaseAnonKey());
}

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
