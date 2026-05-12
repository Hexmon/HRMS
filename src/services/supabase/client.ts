import { supabase } from "@/integrations/supabase/client";

export { supabase };

export function isSupabaseConfigured(): boolean {
  try {
    return Boolean(
      import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    );
  } catch {
    return false;
  }
}
