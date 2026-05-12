import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
export type AppRoleName = Database["public"]["Enums"]["app_role"];

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(
  email: string,
  password: string,
  fullName: string,
) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // Required so email confirm redirects back to the app.
      emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      data: { full_name: fullName },
    },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.warn("[auth] getCurrentUserProfile", error.message);
    return null;
  }
  return data;
}

export async function getUserRoles(userProfileId: string): Promise<AppRoleName[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_profile_id", userProfileId);
  if (error) {
    console.warn("[auth] getUserRoles", error.message);
    return [];
  }
  return (data ?? [])
    .map((r) => (r.roles as { name: AppRoleName } | null)?.name)
    .filter((n): n is AppRoleName => Boolean(n));
}

export async function hasPermission(module: string, action: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_permission", {
    _module: module,
    _action: action,
  });
  if (error) return false;
  return Boolean(data);
}
