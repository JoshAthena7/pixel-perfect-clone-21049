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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      broadcasts: {
        Row: {
          author_id: string
          author_name: string
          content: string
          created_at: string | null
          engagement_id: string
          id: string
          pinned: boolean | null
        }
        Insert: {
          author_id: string
          author_name: string
          content: string
          created_at?: string | null
          engagement_id: string
          id?: string
          pinned?: boolean | null
        }
        Update: {
          author_id?: string
          author_name?: string
          content?: string
          created_at?: string | null
          engagement_id?: string
          id?: string
          pinned?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      client_pulses: {
        Row: {
          action_items: string | null
          created_at: string | null
          engagement_id: string
          id: string
          interaction_date: string
          recorded_by: string
          recorder_name: string
          sentiment: string
          summary: string
        }
        Insert: {
          action_items?: string | null
          created_at?: string | null
          engagement_id: string
          id?: string
          interaction_date?: string
          recorded_by: string
          recorder_name: string
          sentiment: string
          summary: string
        }
        Update: {
          action_items?: string | null
          created_at?: string | null
          engagement_id?: string
          id?: string
          interaction_date?: string
          recorded_by?: string
          recorder_name?: string
          sentiment?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_pulses_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      decisions: {
        Row: {
          created_at: string | null
          created_by: string | null
          decision_date: string
          engagement_id: string
          id: string
          impacted_areas: string | null
          owner_name: string | null
          rationale: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          decision_date?: string
          engagement_id: string
          id?: string
          impacted_areas?: string | null
          owner_name?: string | null
          rationale?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          decision_date?: string
          engagement_id?: string
          id?: string
          impacted_areas?: string | null
          owner_name?: string | null
          rationale?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      engagement_members: {
        Row: {
          added_at: string | null
          display_name: string
          email: string | null
          engagement_id: string
          id: string
          on_call: boolean
          phone: string | null
          role: string
          slack_handle: string | null
          timezone: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          display_name: string
          email?: string | null
          engagement_id: string
          id?: string
          on_call?: boolean
          phone?: string | null
          role?: string
          slack_handle?: string | null
          timezone?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          display_name?: string
          email?: string | null
          engagement_id?: string
          id?: string
          on_call?: boolean
          phone?: string | null
          role?: string
          slack_handle?: string | null
          timezone?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_members_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string
          engagement_id: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date: string
          engagement_id: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string
          engagement_id?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      engagements: {
        Row: {
          client: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          slack_webhook: string | null
          status: string
          submission_date: string | null
        }
        Insert: {
          client: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          slack_webhook?: string | null
          status?: string
          submission_date?: string | null
        }
        Update: {
          client?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          slack_webhook?: string | null
          status?: string
          submission_date?: string | null
        }
        Relationships: []
      }
      heatmap_sections: {
        Row: {
          engagement_id: string
          id: string
          notes: string | null
          section_name: string
          sort_order: number | null
          status: string
          updated_at: string | null
          updated_by_name: string | null
        }
        Insert: {
          engagement_id: string
          id?: string
          notes?: string | null
          section_name: string
          sort_order?: number | null
          status?: string
          updated_at?: string | null
          updated_by_name?: string | null
        }
        Update: {
          engagement_id?: string
          id?: string
          notes?: string | null
          section_name?: string
          sort_order?: number | null
          status?: string
          updated_at?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "heatmap_sections_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      huddles: {
        Row: {
          client_concern: string | null
          created_at: string | null
          engagement_id: string
          health: string
          id: string
          needs_leadership: boolean | null
          notes: string | null
          priority: string
          risk: string | null
          submitted_by: string
          submitter_name: string
          writer_concern: string | null
        }
        Insert: {
          client_concern?: string | null
          created_at?: string | null
          engagement_id: string
          health: string
          id?: string
          needs_leadership?: boolean | null
          notes?: string | null
          priority: string
          risk?: string | null
          submitted_by: string
          submitter_name: string
          writer_concern?: string | null
        }
        Update: {
          client_concern?: string | null
          created_at?: string | null
          engagement_id?: string
          health?: string
          id?: string
          needs_leadership?: boolean | null
          notes?: string | null
          priority?: string
          risk?: string | null
          submitted_by?: string
          submitter_name?: string
          writer_concern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "huddles_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_documents: {
        Row: {
          category: string
          created_at: string | null
          engagement_id: string
          file_path: string | null
          id: string
          name: string
          notes: string | null
          uploaded_by: string | null
          uploader_name: string | null
          url: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          engagement_id: string
          file_path?: string | null
          id?: string
          name: string
          notes?: string | null
          uploaded_by?: string | null
          uploader_name?: string | null
          url?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          engagement_id?: string
          file_path?: string | null
          id?: string
          name?: string
          notes?: string | null
          uploaded_by?: string | null
          uploader_name?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_documents_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          title: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id: string
          title?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          title?: string | null
        }
        Relationships: []
      }
      risks: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          engagement_id: string
          id: string
          likelihood: string
          owner_name: string | null
          severity: string
          status: string
          target_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          engagement_id: string
          id?: string
          likelihood: string
          owner_name?: string | null
          severity: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          engagement_id?: string
          id?: string
          likelihood?: string
          owner_name?: string | null
          severity?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "risks_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          client_sentiment: string | null
          created_at: string
          engagement_id: string
          health: string
          heatmap_json: Json
          id: string
          open_risk_count: number
          open_sos_count: number
          snapshot_date: string
          taken_by: string | null
          taken_by_name: string
          temperature_score: number
          top_priority: string | null
          top_risk: string | null
          updated_at: string
        }
        Insert: {
          client_sentiment?: string | null
          created_at?: string
          engagement_id: string
          health: string
          heatmap_json?: Json
          id?: string
          open_risk_count?: number
          open_sos_count?: number
          snapshot_date?: string
          taken_by?: string | null
          taken_by_name: string
          temperature_score?: number
          top_priority?: string | null
          top_risk?: string | null
          updated_at?: string
        }
        Update: {
          client_sentiment?: string | null
          created_at?: string
          engagement_id?: string
          health?: string
          heatmap_json?: Json
          id?: string
          open_risk_count?: number
          open_sos_count?: number
          snapshot_date?: string
          taken_by?: string | null
          taken_by_name?: string
          temperature_score?: number
          top_priority?: string | null
          top_risk?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sos_alerts: {
        Row: {
          category: string
          created_at: string | null
          description: string
          engagement_id: string
          id: string
          owner_name: string | null
          recommended_action: string | null
          resolved_at: string | null
          severity: string
          status: string
          submitted_by: string
          submitter_name: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          engagement_id: string
          id?: string
          owner_name?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity: string
          status?: string
          submitted_by: string
          submitter_name: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          engagement_id?: string
          id?: string
          owner_name?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          submitted_by?: string
          submitter_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sos_alerts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
