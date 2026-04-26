import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://wccagykzugrahwugefqt.supabase.co"
const supabaseAnonKey = "sb_publishable_fPF6GuoPYHHemfJx1qI-lQ_ijQHRQUn"

export const supabase = createClient(supabaseUrl, supabaseAnonKey)