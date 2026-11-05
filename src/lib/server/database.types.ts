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
      block_templates: {
        Row: {
          assignable: boolean
          color: string
          duration_minutes: number
          id: string
          name: string
          sort: number
          user_id: string
          weekdays: number[]
        }
        Insert: {
          assignable?: boolean
          color: string
          duration_minutes: number
          id?: string
          name: string
          sort?: number
          user_id?: string
          weekdays: number[]
        }
        Update: {
          assignable?: boolean
          color?: string
          duration_minutes?: number
          id?: string
          name?: string
          sort?: number
          user_id?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      blocks: {
        Row: {
          day: string
          duration_minutes: number
          id: string
          project_id: string | null
          start_time: string
          template_id: string
          user_id: string
        }
        Insert: {
          day: string
          duration_minutes: number
          id?: string
          project_id?: string | null
          start_time: string
          template_id: string
          user_id?: string
        }
        Update: {
          day?: string
          duration_minutes?: number
          id?: string
          project_id?: string | null
          start_time?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_user_id_project_id_fkey"
            columns: ["user_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "blocks_user_id_template_id_fkey"
            columns: ["user_id", "template_id"]
            isOneToOne: false
            referencedRelation: "block_templates"
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
      events: {
        Row: {
          all_day: boolean
          created_at: string
          end_date: string | null
          ends_at: string | null
          id: string
          location: string | null
          notes: string | null
          start_date: string | null
          starts_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          end_date?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          start_date?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          end_date?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          start_date?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_events: {
        Row: {
          all_day: boolean
          end_date: string | null
          ends_at: string | null
          feed_id: string
          id: number
          location: string | null
          notes: string | null
          start_date: string | null
          starts_at: string | null
          title: string
          uid: string
          user_id: string
        }
        Insert: {
          all_day: boolean
          end_date?: string | null
          ends_at?: string | null
          feed_id: string
          id?: never
          location?: string | null
          notes?: string | null
          start_date?: string | null
          starts_at?: string | null
          title: string
          uid: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          end_date?: string | null
          ends_at?: string | null
          feed_id?: string
          id?: never
          location?: string | null
          notes?: string | null
          start_date?: string | null
          starts_at?: string | null
          title?: string
          uid?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_events_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      feeds: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          name: string
          url: string
          user_id: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name: string
          url: string
          user_id?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          name?: string
          url?: string
          user_id?: string
          visible?: boolean
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
      projects: {
        Row: {
          archived: boolean
          area: string
          color: string
          github_milestone: number | null
          github_repo: string | null
          hours_done: number
          id: string
          milestone: string | null
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          archived?: boolean
          area: string
          color: string
          github_milestone?: number | null
          github_repo?: string | null
          hours_done?: number
          id?: string
          milestone?: string | null
          name: string
          sort?: number
          user_id?: string
        }
        Update: {
          archived?: boolean
          area?: string
          color?: string
          github_milestone?: number | null
          github_repo?: string | null
          hours_done?: number
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
          match: string
          pattern: string
          priority: number
          source_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          match?: string
          pattern: string
          priority?: number
          source_id?: string | null
          user_id?: string
        }
        Update: {
          id?: string
          match?: string
          pattern?: string
          priority?: number
          source_id?: string | null
          user_id?: string
        }
        Relationships: [
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
          created_at: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          created_at: string
          done: boolean
          id: string
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          position: number
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          position?: number
          title?: string
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
