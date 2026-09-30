import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabase, serverConfig } from "@/lib/config/server";

let client: SupabaseClient | null = null;

/** Service role client. Server only; the key never reaches the browser. */
export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  client ??= createClient(serverConfig.supabaseUrl, serverConfig.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
