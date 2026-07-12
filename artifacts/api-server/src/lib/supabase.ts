import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is missing.");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY environment variable is missing.",
  );
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);
