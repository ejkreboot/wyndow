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
    PostgrestVersion: "13.0.5"
  }
  wyndow: {
    Tables: {
      block_allocations: {
        Row: {
          block_index: number
          day: string
          project_id: string
          user_id: string
        }
        Insert: {
          block_index: number
          day: string
          project_id: string
          user_id?: string
        }
        Update: {
          block_index?: number
          day?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_allocations_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day_end: string | null
          all_day_start: string | null
          description: string | null
          ends_at: string | null
          id: string
          source_id: string
          starts_at: string | null
          title: string
          uid: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day_end?: string | null
          all_day_start?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          source_id: string
          starts_at?: string | null
          title: string
          uid: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          all_day_end?: string | null
          all_day_start?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          source_id?: string
          starts_at?: string | null
          title?: string
          uid?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "calendar_sources"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      calendar_sources: {
        Row: {
          created_at: string
          ics_url: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ics_url: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ics_url?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          current_unit: string | null
          id: string
          name: string
          packets_ready: number
          sort: number
          student: string
          user_id: string
          wyrkbook_ref: string | null
        }
        Insert: {
          current_unit?: string | null
          id?: string
          name: string
          packets_ready?: number
          sort?: number
          student: string
          user_id?: string
          wyrkbook_ref?: string | null
        }
        Update: {
          current_unit?: string | null
          id?: string
          name?: string
          packets_ready?: number
          sort?: number
          student?: string
          user_id?: string
          wyrkbook_ref?: string | null
        }
        Relationships: []
      }
      focus_sessions: {
        Row: {
          day: string
          ended_at: string | null
          id: string
          note: string | null
          project_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          day: string
          ended_at?: string | null
          id?: string
          note?: string | null
          project_id: string
          started_at?: string
          user_id?: string
        }
        Update: {
          day?: string
          ended_at?: string | null
          id?: string
          note?: string | null
          project_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "focus_sessions_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      kinds: {
        Row: {
          builtin: string | null
          color: string | null
          focus_hours: number
          focus_start: string | null
          id: string
          name: string
          next_day_kind_id: string | null
          school_mode: string
          sort: number
          user_id: string
        }
        Insert: {
          builtin?: string | null
          color?: string | null
          focus_hours?: number
          focus_start?: string | null
          id?: string
          name: string
          next_day_kind_id?: string | null
          school_mode?: string
          sort?: number
          user_id?: string
        }
        Update: {
          builtin?: string | null
          color?: string | null
          focus_hours?: number
          focus_start?: string | null
          id?: string
          name?: string
          next_day_kind_id?: string | null
          school_mode?: string
          sort?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinds_user_id_next_day_kind_id_fkey"
            columns: ["user_id", "next_day_kind_id"]
            isOneToOne: false
            referencedRelation: "kinds"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          area: string
          blocks_done: number
          color: string
          github_repo: string | null
          id: string
          milestone: string | null
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          area: string
          blocks_done?: number
          color: string
          github_repo?: string | null
          id?: string
          milestone?: string | null
          name: string
          sort?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          area?: string
          blocks_done?: number
          color?: string
          github_repo?: string | null
          id?: string
          milestone?: string | null
          name?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          id: string
          kind_id: string
          match: string
          pattern: string
          priority: number
          source_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          kind_id: string
          match?: string
          pattern: string
          priority?: number
          source_id?: string | null
          user_id?: string
        }
        Update: {
          id?: string
          kind_id?: string
          match?: string
          pattern?: string
          priority?: number
          source_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_user_id_kind_id_fkey"
            columns: ["user_id", "kind_id"]
            isOneToOne: false
            referencedRelation: "kinds"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "rules_user_id_source_id_fkey"
            columns: ["user_id", "source_id"]
            isOneToOne: false
            referencedRelation: "calendar_sources"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      settings: {
        Row: {
          block_hours: number
          chunk_min_hours: number
          created_at: string
          school_days: number[]
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          block_hours?: number
          chunk_min_hours?: number
          created_at?: string
          school_days?: number[]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          block_hours?: number
          chunk_min_hours?: number
          created_at?: string
          school_days?: number[]
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_defaults: { Args: never; Returns: undefined }
      set_allocations: { Args: { p: Json }; Returns: undefined }
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
  wyndow: {
    Enums: {},
  },
} as const
