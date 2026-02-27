import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.error("[v0] Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!supabaseAnonKey) {
  console.error("[v0] Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable")
}

console.log("[v0] Initializing Supabase client with URL:", supabaseUrl.substring(0, 30) + "...")

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
