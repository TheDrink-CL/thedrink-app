import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wcuxjxaquiypzinxakxu.supabase.co'
const SUPABASE_KEY = 'sb_publishable_UzDdk9WWxGhA8IysMVNz_w_FIz_k1wI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
