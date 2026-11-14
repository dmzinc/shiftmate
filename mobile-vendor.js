import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

// Preserve the globals expected by the existing classic-script application.
window.supabase = { createClient };
window.XLSX = XLSX;
