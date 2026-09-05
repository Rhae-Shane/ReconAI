/**
 * Supabase database row types for ReconAI (AI Finance Controller).
 * Mirrors supabase/migrations/0001_init.sql; the authoritative types are
 * harness/src/core/types.ts. Money is integer paise.
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      close_runs: {
        Row: {
          id: string;
          batch_id: string | null;
          status: string;
          started_at: string;
          finished_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["close_runs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["close_runs"]["Row"]>;
      };
      fin_records: {
        Row: {
          id: string;
          run_id: string;
          source: string;
          kind: string;
          source_name: string | null;
          source_ref: string;
          value_date: string;
          amount_paise: number;
          currency: string;
          counterparty: string | null;
          description: string | null;
          utr: string | null;
          gateway_ref: string | null;
          order_ref: string | null;
          fee_tax_paise: number | null;
          raw: Json | null;
        };
        Insert: Partial<Database["public"]["Tables"]["fin_records"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["fin_records"]["Row"]>;
      };
      match_groups: {
        Row: {
          id: string;
          run_id: string;
          key: string;
          method: string;
          match_type: string;
          confidence: number;
          reason: string;
          amount_paise: number;
          value_date: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["match_groups"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["match_groups"]["Row"]>;
      };
      match_links: {
        Row: {
          id: string;
          group_id: string;
          record_id: string;
          matched_on: string;
          match_type: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["match_links"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["match_links"]["Row"]>;
      };
      nettings: {
        Row: {
          id: string;
          group_id: string;
          gross_paise: number;
          fee_paise: number;
          tax_on_fee_paise: number;
          refund_paise: number;
          adjustment_paise: number;
          net_expected_paise: number;
          actual_settlement_paise: number;
          variance_paise: number;
        };
        Insert: Partial<Database["public"]["Tables"]["nettings"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["nettings"]["Row"]>;
      };
      settlements: {
        Row: {
          id: string;
          run_id: string;
          group_keys: Json;
          settled_at: string | null;
          amount_paise: number;
          utr: string | null;
          status: string;
          lag_days: number | null;
          lines: Json | null;
        };
        Insert: Partial<Database["public"]["Tables"]["settlements"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["settlements"]["Row"]>;
      };
      forecast: {
        Row: {
          id: string;
          run_id: string;
          date: string;
          balance_paise: number;
          delta_paise: number;
          confidence: number;
          reconciled_in: boolean;
        };
        Insert: Partial<Database["public"]["Tables"]["forecast"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["forecast"]["Row"]>;
      };
      tax_categories: {
        Row: {
          id: string;
          code: string;
          label: string;
          description: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["tax_categories"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tax_categories"]["Row"]>;
      };
      tax_line_matches: {
        Row: {
          id: string;
          run_id: string;
          record_id: string;
          category_id: string | null;
          category_code: string | null;
          category_label: string | null;
          matched_by: string;
          confidence: number;
          reason: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tax_line_matches"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["tax_line_matches"]["Row"]>;
      };
      exceptions: {
        Row: {
          id: string;
          run_id: string;
          record_id: string | null;
          record_json: Json;
          reason_code: string;
          rationale: string;
          candidate_ids: Json;
          status: string;
          match_type: string | null;
          confidence: number | null;
          expected_paise: number | null;
          actual_paise: number | null;
          variance_paise: number | null;
          fee_paise: number | null;
          adjustment_paise: number | null;
          refund_paise: number | null;
          ai_reasoning: string | null;
          reviewer_decision: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["exceptions"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["exceptions"]["Row"]>;
      };
      audit_events: {
        Row: {
          id: string;
          run_id: string;
          actor_type: string;
          actor_id: string;
          action: string;
          record_id: string | null;
          detail: Json | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_events"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Row"]>;
      };
      close_reports: {
        Row: {
          id: string;
          run_id: string;
          generated_at: string;
          totals: Json;
          breakdown: Json;
          unresolved: Json;
          per_source: Json;
          precision: number | null;
          recall: number | null;
          judge: Json | null;
          confidence_bins: Json | null;
          audit_count: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["close_reports"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["close_reports"]["Row"]>;
      };
      finance_configs: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["finance_configs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["finance_configs"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
