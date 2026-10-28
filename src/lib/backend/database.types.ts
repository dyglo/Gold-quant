export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      alert_events: {
        Row: {
          first_seen: string
          id: string
          last_seen: string
          payload: Json
          resolved_at: string | null
          rule: string
          severity: string
        }
        Insert: {
          first_seen?: string
          id?: string
          last_seen?: string
          payload: Json
          resolved_at?: string | null
          rule: string
          severity: string
        }
        Update: {
          first_seen?: string
          id?: string
          last_seen?: string
          payload?: Json
          resolved_at?: string | null
          rule?: string
          severity?: string
        }
        Relationships: []
      }
      data_quality_flags: {
        Row: {
          code: string
          created_at: string
          details: Json
          id: number
          obs_date: string | null
          run_id: string
          series_id: string | null
          severity: string
        }
        Insert: {
          code: string
          created_at?: string
          details?: Json
          id?: never
          obs_date?: string | null
          run_id: string
          series_id?: string | null
          severity: string
        }
        Update: {
          code?: string
          created_at?: string
          details?: Json
          id?: never
          obs_date?: string | null
          run_id?: string
          series_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_quality_flags_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_quality_flags_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          available_at: string
          event_at: string | null
          event_date: string
          id: number
          kind: string
          run_id: string
          source_url: string
        }
        Insert: {
          available_at: string
          event_at?: string | null
          event_date: string
          id?: never
          kind: string
          run_id: string
          source_url: string
        }
        Update: {
          available_at?: string
          event_at?: string | null
          event_date?: string
          id?: never
          kind?: string
          run_id?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_bars: {
        Row: {
          available_at: string
          close: number
          close_at: string
          complete: boolean
          content_hash: string
          high: number
          id: number
          instrument: string
          low: number
          open: number
          run_id: string
          start_at: string
          vendor: string
          volume: number
        }
        Insert: {
          available_at: string
          close: number
          close_at: string
          complete: boolean
          content_hash: string
          high: number
          id?: never
          instrument: string
          low: number
          open: number
          run_id: string
          start_at: string
          vendor: string
          volume: number
        }
        Update: {
          available_at?: string
          close?: number
          close_at?: string
          complete?: boolean
          content_hash?: string
          high?: number
          id?: never
          instrument?: string
          low?: number
          open?: number
          run_id?: string
          start_at?: string
          vendor?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "fx_bars_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_runs: {
        Row: {
          error_code: string | null
          finished_at: string | null
          id: string
          job: string
          parameters: Json
          rows_written: number
          started_at: string
          status: string
        }
        Insert: {
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job: string
          parameters?: Json
          rows_written?: number
          started_at?: string
          status?: string
        }
        Update: {
          error_code?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          parameters?: Json
          rows_written?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      observations: {
        Row: {
          availability_basis: string
          available_at: string
          content_hash: string
          evidence_url: string | null
          id: number
          ingested_at: string
          obs_date: string
          run_id: string
          series_id: string
          value: number
          vendor: string
        }
        Insert: {
          availability_basis: string
          available_at: string
          content_hash: string
          evidence_url?: string | null
          id?: never
          ingested_at?: string
          obs_date: string
          run_id: string
          series_id: string
          value: number
          vendor: string
        }
        Update: {
          availability_basis?: string
          available_at?: string
          content_hash?: string
          evidence_url?: string | null
          id?: never
          ingested_at?: string
          obs_date?: string
          run_id?: string
          series_id?: string
          value?: number
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "observations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      series: {
        Row: {
          active: boolean
          frequency: string
          id: string
          license_note: string
          max_age_days: number
          name: string
          unit: string
          vendor: string
        }
        Insert: {
          active?: boolean
          frequency: string
          id: string
          license_note: string
          max_age_days: number
          name: string
          unit: string
          vendor: string
        }
        Update: {
          active?: boolean
          frequency?: string
          id?: string
          license_note?: string
          max_age_days?: number
          name?: string
          unit?: string
          vendor?: string
        }
        Relationships: []
      }
      trials: {
        Row: {
          candidate_count: number
          config: Json
          created_at: string
          data_fingerprint: string
          deflated_sharpe_inputs: Json
          id: string
          request_key: string
          results: Json
          user_id: string
        }
        Insert: {
          candidate_count: number
          config: Json
          created_at?: string
          data_fingerprint: string
          deflated_sharpe_inputs: Json
          id?: string
          request_key: string
          results: Json
          user_id: string
        }
        Update: {
          candidate_count?: number
          config?: Json
          created_at?: string
          data_fingerprint?: string
          deflated_sharpe_inputs?: Json
          id?: string
          request_key?: string
          results?: Json
          user_id?: string
        }
        Relationships: []
      }
      vendor_requests: {
        Row: {
          id: number
          requested_at: string
          vendor: string
        }
        Insert: {
          id?: never
          requested_at?: string
          vendor: string
        }
        Update: {
          id?: never
          requested_at?: string
          vendor?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_observations: { Args: { batch: Json }; Returns: number }
      data_health: { Args: never; Returns: Json }
      ingestion_clock: { Args: never; Returns: string }
      job_health: { Args: never; Returns: Json }
      reserve_twelve_request: { Args: never; Returns: boolean }
      series_as_of: {
        Args: {
          as_of: string
          end_date?: string
          series_ids: string[]
          start_date?: string
        }
        Returns: {
          bar_close: string
          bar_date: string
          points: Json
        }[]
      }
      trial_summary: { Args: { owner_id: string }; Returns: Json }
      us_business_day: { Args: { d: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
