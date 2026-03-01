// types/perps.ts - UPDATE THIS FILE
export interface PerpsToken {
  id?: number;
  symbol: string;
  name: string;
  uuid?: string;
  token_address?: string;  // ✅ Add this
  pair_standard?: string;
  pair_inverse?: string;
  base_precision?: number;
  quote_precision?: number;
  min_leverage?: number;
  max_leverage?: number;
  min_position_size?: number;
  max_position_size?: number;
  maintenance_margin?: number;
  funding_rate_coefficient?: number;
  is_active?: boolean;
  icon_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PerpsTokenFormData {
  symbol: string;
  name: string;
  uuid?: string;
  token_address?: string;  // ✅ Add this
  pair_standard?: string;
  pair_inverse?: string;
  base_precision?: number;
  quote_precision?: number;
  min_leverage?: number;
  max_leverage?: number;
  min_position_size?: number;
  max_position_size?: number;
  maintenance_margin?: number;
  funding_rate_coefficient?: number;
  is_active?: boolean;
  icon_url?: string;
}