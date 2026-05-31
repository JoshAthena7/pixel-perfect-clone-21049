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
      activity_log: {
        Row: {
          action: string
          actor_name: string
          created_at: string
          engagement_id: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_table: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_name: string
          created_at?: string
          engagement_id: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_name?: string
          created_at?: string
          engagement_id?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      alignment_signals: {
        Row: {
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          notes: string | null
          owner_name: string | null
          signal_type: string
          source: string | null
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          notes?: string | null
          owner_name?: string | null
          signal_type: string
          source?: string | null
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          notes?: string | null
          owner_name?: string | null
          signal_type?: string
          source?: string | null
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alignment_signals_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      assumptions: {
        Row: {
          confidence: string | null
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          owner: string | null
          risk_if_wrong: string | null
          text: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          owner?: string | null
          risk_if_wrong?: string | null
          text: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          owner?: string | null
          risk_if_wrong?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "assumptions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_acks: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          acknowledged_by_name: string
          engagement_id: string
          id: string
          source_key: string
          type: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          acknowledged_by_name: string
          engagement_id: string
          id?: string
          source_key: string
          type: string
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          acknowledged_by_name?: string
          engagement_id?: string
          id?: string
          source_key?: string
          type?: string
        }
        Relationships: []
      }
      broadcast_reads: {
        Row: {
          broadcast_id: string
          engagement_id: string
          id: string
          member_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          engagement_id: string
          id?: string
          member_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          engagement_id?: string
          id?: string
          member_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
      change_tracker: {
        Row: {
          change_type: string
          created_at: string
          created_by: string | null
          description: string | null
          engagement_id: string
          id: string
          impact: string | null
          item_name: string | null
          logged_by: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id: string
          id?: string
          impact?: string | null
          item_name?: string | null
          logged_by?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string
          id?: string
          impact?: string | null
          item_name?: string | null
          logged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_tracker_engagement_id_fkey"
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
      compliance_documents: {
        Row: {
          created_at: string
          doc_type: string
          engagement_id: string
          file_path: string | null
          id: string
          name: string
          page_count: number | null
          requirement_count: number
          source: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: string
          engagement_id: string
          file_path?: string | null
          id?: string
          name: string
          page_count?: number | null
          requirement_count?: number
          source?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: string
          engagement_id?: string
          file_path?: string | null
          id?: string
          name?: string
          page_count?: number | null
          requirement_count?: number
          source?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_documents_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_requirements: {
        Row: {
          addressed_in_questions: string[]
          addressed_in_sections: string[]
          ai_confidence: number | null
          ai_explanation: string | null
          ai_quote: string | null
          ai_verified: boolean
          created_at: string
          document_id: string
          engagement_id: string
          id: string
          last_checked_at: string | null
          notes: string | null
          requirement_text: string
          requirement_type: string | null
          section_reference: string | null
          status: string
        }
        Insert: {
          addressed_in_questions?: string[]
          addressed_in_sections?: string[]
          ai_confidence?: number | null
          ai_explanation?: string | null
          ai_quote?: string | null
          ai_verified?: boolean
          created_at?: string
          document_id: string
          engagement_id: string
          id?: string
          last_checked_at?: string | null
          notes?: string | null
          requirement_text: string
          requirement_type?: string | null
          section_reference?: string | null
          status?: string
        }
        Update: {
          addressed_in_questions?: string[]
          addressed_in_sections?: string[]
          ai_confidence?: number | null
          ai_explanation?: string | null
          ai_quote?: string | null
          ai_verified?: boolean
          created_at?: string
          document_id?: string
          engagement_id?: string
          id?: string
          last_checked_at?: string | null
          notes?: string | null
          requirement_text?: string
          requirement_type?: string | null
          section_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_requirements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "compliance_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_requirements_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      content_library: {
        Row: {
          added_by: string | null
          body: string | null
          category: string
          created_at: string
          engagement_id: string | null
          id: string
          name: string | null
          notes: string | null
          source_engagement_id: string | null
          tags: string[] | null
          title: string | null
          url: string | null
        }
        Insert: {
          added_by?: string | null
          body?: string | null
          category?: string
          created_at?: string
          engagement_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          source_engagement_id?: string | null
          tags?: string[] | null
          title?: string | null
          url?: string | null
        }
        Update: {
          added_by?: string | null
          body?: string | null
          category?: string
          created_at?: string
          engagement_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          source_engagement_id?: string | null
          tags?: string[] | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_library_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_library_source_engagement_id_fkey"
            columns: ["source_engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          engagement_id: string
          id: string
          response: string
          user_id: string | null
        }
        Insert: {
          checkin_date?: string
          created_at?: string
          engagement_id: string
          id?: string
          response: string
          user_id?: string | null
        }
        Update: {
          checkin_date?: string
          created_at?: string
          engagement_id?: string
          id?: string
          response?: string
          user_id?: string | null
        }
        Relationships: []
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
      differentiators: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          engagement_id: string
          id: string
          substantiation: string | null
          title: string
          versus: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id: string
          id?: string
          substantiation?: string | null
          title: string
          versus?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string
          id?: string
          substantiation?: string | null
          title?: string
          versus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "differentiators_engagement_id_fkey"
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
      embedding_queue: {
        Row: {
          attempts: number
          content_text: string
          engagement_id: string | null
          id: string
          last_error: string | null
          priority: number
          processed_at: string | null
          queued_at: string
          source_id: string
          source_table: string
        }
        Insert: {
          attempts?: number
          content_text: string
          engagement_id?: string | null
          id?: string
          last_error?: string | null
          priority?: number
          processed_at?: string | null
          queued_at?: string
          source_id: string
          source_table: string
        }
        Update: {
          attempts?: number
          content_text?: string
          engagement_id?: string | null
          id?: string
          last_error?: string | null
          priority?: number
          processed_at?: string | null
          queued_at?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      embeddings: {
        Row: {
          content_text: string
          created_at: string
          embedding: string | null
          engagement_id: string | null
          id: string
          source_id: string
          source_table: string
          updated_at: string
        }
        Insert: {
          content_text: string
          created_at?: string
          embedding?: string | null
          engagement_id?: string | null
          id?: string
          source_id: string
          source_table: string
          updated_at?: string
        }
        Update: {
          content_text?: string
          created_at?: string
          embedding?: string | null
          engagement_id?: string | null
          id?: string
          source_id?: string
          source_table?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_config: {
        Row: {
          competitors: string[]
          contract_value_estimate: string | null
          created_at: string
          engagement_id: string
          engagement_type: string | null
          evaluation_criteria: string[]
          id: string
          incumbent: string | null
          key_differentiators: string[]
          local_requirements: string | null
          market: string | null
          radar_keywords: string[] | null
          radar_monitoring: boolean
          research_completed_at: string | null
          services_checklist: Json | null
          sizing_assumptions: Json | null
          sizing_data: Json | null
          state: string | null
          state_specific_notes: string | null
          submission_days_remaining: number | null
          updated_at: string
        }
        Insert: {
          competitors?: string[]
          contract_value_estimate?: string | null
          created_at?: string
          engagement_id: string
          engagement_type?: string | null
          evaluation_criteria?: string[]
          id?: string
          incumbent?: string | null
          key_differentiators?: string[]
          local_requirements?: string | null
          market?: string | null
          radar_keywords?: string[] | null
          radar_monitoring?: boolean
          research_completed_at?: string | null
          services_checklist?: Json | null
          sizing_assumptions?: Json | null
          sizing_data?: Json | null
          state?: string | null
          state_specific_notes?: string | null
          submission_days_remaining?: number | null
          updated_at?: string
        }
        Update: {
          competitors?: string[]
          contract_value_estimate?: string | null
          created_at?: string
          engagement_id?: string
          engagement_type?: string | null
          evaluation_criteria?: string[]
          id?: string
          incumbent?: string | null
          key_differentiators?: string[]
          local_requirements?: string | null
          market?: string | null
          radar_keywords?: string[] | null
          radar_monitoring?: boolean
          research_completed_at?: string | null
          services_checklist?: Json | null
          sizing_assumptions?: Json | null
          sizing_data?: Json | null
          state?: string | null
          state_specific_notes?: string | null
          submission_days_remaining?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      engagement_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          display_name: string
          email: string
          engagement_id: string
          id: string
          invited_by: string
          invited_by_name: string
          revoked_at: string | null
          role: string
          title: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name: string
          email: string
          engagement_id: string
          id?: string
          invited_by: string
          invited_by_name: string
          revoked_at?: string | null
          role: string
          title?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          display_name?: string
          email?: string
          engagement_id?: string
          id?: string
          invited_by?: string
          invited_by_name?: string
          revoked_at?: string | null
          role?: string
          title?: string | null
          token?: string
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
          nda_confirmed: boolean
          nda_confirmed_at: string | null
          nda_confirmed_by: string | null
          nda_required: boolean
          on_call: boolean
          phone: string | null
          role: string
          slack_handle: string | null
          timezone: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          display_name: string
          email?: string | null
          engagement_id: string
          id?: string
          nda_confirmed?: boolean
          nda_confirmed_at?: string | null
          nda_confirmed_by?: string | null
          nda_required?: boolean
          on_call?: boolean
          phone?: string | null
          role?: string
          slack_handle?: string | null
          timezone?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          display_name?: string
          email?: string | null
          engagement_id?: string
          id?: string
          nda_confirmed?: boolean
          nda_confirmed_at?: string | null
          nda_confirmed_by?: string | null
          nda_required?: boolean
          on_call?: boolean
          phone?: string | null
          role?: string
          slack_handle?: string | null
          timezone?: string | null
          title?: string | null
          user_id?: string | null
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
      engagement_outcomes: {
        Row: {
          award_amount: number | null
          awardee: string | null
          created_at: string
          decision_date: string | null
          engagement_id: string
          id: string
          notes: string | null
          outcome: string
          recorded_by: string | null
          recorder_name: string | null
          updated_at: string
        }
        Insert: {
          award_amount?: number | null
          awardee?: string | null
          created_at?: string
          decision_date?: string | null
          engagement_id: string
          id?: string
          notes?: string | null
          outcome: string
          recorded_by?: string | null
          recorder_name?: string | null
          updated_at?: string
        }
        Update: {
          award_amount?: number | null
          awardee?: string | null
          created_at?: string
          decision_date?: string | null
          engagement_id?: string
          id?: string
          notes?: string | null
          outcome?: string
          recorded_by?: string | null
          recorder_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_outcomes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_postmortems: {
        Row: {
          engagement_id: string
          generated_at: string
          id: string
          lessons_learned: Json | null
          outcome: string
          summary: string
        }
        Insert: {
          engagement_id: string
          generated_at?: string
          id?: string
          lessons_learned?: Json | null
          outcome: string
          summary: string
        }
        Update: {
          engagement_id?: string
          generated_at?: string
          id?: string
          lessons_learned?: Json | null
          outcome?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_postmortems_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_pulses: {
        Row: {
          created_at: string
          engagement_id: string
          id: string
          last_flag_note: string | null
          last_flag_type: string | null
          last_recognition_note: string | null
          last_recognition_type: string | null
          member_id: string
          star_count: number
          tlc_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          id?: string
          last_flag_note?: string | null
          last_flag_type?: string | null
          last_recognition_note?: string | null
          last_recognition_type?: string | null
          member_id: string
          star_count?: number
          tlc_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          id?: string
          last_flag_note?: string | null
          last_flag_type?: string | null
          last_recognition_note?: string | null
          last_recognition_type?: string | null
          member_id?: string
          star_count?: number
          tlc_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      engagement_research: {
        Row: {
          category: string
          confidence_score: number | null
          content: Json | null
          created_at: string
          engagement_id: string
          human_input_note: string | null
          id: string
          needs_human_input: boolean
          source: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          category: string
          confidence_score?: number | null
          content?: Json | null
          created_at?: string
          engagement_id: string
          human_input_note?: string | null
          id?: string
          needs_human_input?: boolean
          source?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          confidence_score?: number | null
          content?: Json | null
          created_at?: string
          engagement_id?: string
          human_input_note?: string | null
          id?: string
          needs_human_input?: boolean
          source?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_research_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_rfp_data: {
        Row: {
          compliance_notes: string | null
          contract_term: string | null
          contract_type: string | null
          contract_value: string | null
          created_at: string
          engagement_id: string
          evaluation_method: string | null
          id: string
          incumbent: string | null
          issuing_agency: string | null
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          compliance_notes?: string | null
          contract_term?: string | null
          contract_type?: string | null
          contract_value?: string | null
          created_at?: string
          engagement_id: string
          evaluation_method?: string | null
          id?: string
          incumbent?: string | null
          issuing_agency?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          compliance_notes?: string | null
          contract_term?: string | null
          contract_type?: string | null
          contract_value?: string | null
          created_at?: string
          engagement_id?: string
          evaluation_method?: string | null
          id?: string
          incumbent?: string | null
          issuing_agency?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_rfp_data_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          client: string
          closed_at: string | null
          contract_value_estimate: number | null
          created_at: string | null
          created_by: string | null
          engagement_lead: string | null
          engagement_type: string | null
          executive_sponsor: string | null
          health: string
          id: string
          market: string | null
          mission_type: string | null
          name: string
          phase: string | null
          program: string | null
          project_manager: string | null
          slack_webhook: string | null
          state: string | null
          status: string
          submission_date: string | null
        }
        Insert: {
          client: string
          closed_at?: string | null
          contract_value_estimate?: number | null
          created_at?: string | null
          created_by?: string | null
          engagement_lead?: string | null
          engagement_type?: string | null
          executive_sponsor?: string | null
          health?: string
          id?: string
          market?: string | null
          mission_type?: string | null
          name: string
          phase?: string | null
          program?: string | null
          project_manager?: string | null
          slack_webhook?: string | null
          state?: string | null
          status?: string
          submission_date?: string | null
        }
        Update: {
          client?: string
          closed_at?: string | null
          contract_value_estimate?: number | null
          created_at?: string | null
          created_by?: string | null
          engagement_lead?: string | null
          engagement_type?: string | null
          executive_sponsor?: string | null
          health?: string
          id?: string
          market?: string | null
          mission_type?: string | null
          name?: string
          phase?: string | null
          program?: string | null
          project_manager?: string | null
          slack_webhook?: string | null
          state?: string | null
          status?: string
          submission_date?: string | null
        }
        Relationships: []
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          engagement_id: string
          id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          engagement_id: string
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          engagement_id?: string
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      heatmap_sections: {
        Row: {
          engagement_id: string
          evaluation_weight_pct: number | null
          id: string
          instructions: string | null
          notes: string | null
          section_name: string
          sensitivity: string
          sort_order: number | null
          status: string
          updated_at: string | null
          updated_by_name: string | null
        }
        Insert: {
          engagement_id: string
          evaluation_weight_pct?: number | null
          id?: string
          instructions?: string | null
          notes?: string | null
          section_name: string
          sensitivity?: string
          sort_order?: number | null
          status?: string
          updated_at?: string | null
          updated_by_name?: string | null
        }
        Update: {
          engagement_id?: string
          evaluation_weight_pct?: number | null
          id?: string
          instructions?: string | null
          notes?: string | null
          section_name?: string
          sensitivity?: string
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
      holy_grail_runs: {
        Row: {
          created_at: string
          current_step: string | null
          engagement_id: string
          error: string | null
          id: string
          status: string
          steps_done: number
          steps_total: number
          triggered_by: string | null
          triggered_by_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_step?: string | null
          engagement_id: string
          error?: string | null
          id?: string
          status?: string
          steps_done?: number
          steps_total?: number
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_step?: string | null
          engagement_id?: string
          error?: string | null
          id?: string
          status?: string
          steps_done?: number
          steps_total?: number
          triggered_by?: string | null
          triggered_by_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hook_failures: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          dedupe_key: string | null
          error_message: string | null
          hook_name: string
          id: string
          jobid: number | null
          notified_at: string | null
          payload: Json | null
          runid: number | null
          source: string
          status_code: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          hook_name: string
          id?: string
          jobid?: number | null
          notified_at?: string | null
          payload?: Json | null
          runid?: number | null
          source: string
          status_code?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          dedupe_key?: string | null
          error_message?: string | null
          hook_name?: string
          id?: string
          jobid?: number | null
          notified_at?: string | null
          payload?: Json | null
          runid?: number | null
          source?: string
          status_code?: number | null
        }
        Relationships: []
      }
      huddles: {
        Row: {
          client_concern: string | null
          created_at: string | null
          created_by: string | null
          engagement_id: string
          health: string
          id: string
          leadership_needed: boolean | null
          notes: string | null
          priority: string
          risk: string | null
          submitted_by: string | null
          submitter_name: string
          writer_concern: string | null
        }
        Insert: {
          client_concern?: string | null
          created_at?: string | null
          created_by?: string | null
          engagement_id: string
          health: string
          id?: string
          leadership_needed?: boolean | null
          notes?: string | null
          priority: string
          risk?: string | null
          submitted_by?: string | null
          submitter_name: string
          writer_concern?: string | null
        }
        Update: {
          client_concern?: string | null
          created_at?: string | null
          created_by?: string | null
          engagement_id?: string
          health?: string
          id?: string
          leadership_needed?: boolean | null
          notes?: string | null
          priority?: string
          risk?: string | null
          submitted_by?: string | null
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
      insight_type_weights: {
        Row: {
          accuracy_rate: number | null
          base_confidence: number
          confirmed_count: number
          insight_type: string
          total_count: number
          updated_at: string
        }
        Insert: {
          accuracy_rate?: number | null
          base_confidence?: number
          confirmed_count?: number
          insight_type: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          accuracy_rate?: number | null
          base_confidence?: number
          confirmed_count?: number
          insight_type?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: []
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
      intelligence_insights: {
        Row: {
          actioned: boolean
          actioned_at: string | null
          actioned_by: string | null
          body: string
          confidence_score: number
          confirmed_predictive: boolean | null
          created_at: string
          engagement_id: string | null
          id: string
          insight_type: string
          severity: string
          supporting_data: Json | null
          title: string
        }
        Insert: {
          actioned?: boolean
          actioned_at?: string | null
          actioned_by?: string | null
          body: string
          confidence_score?: number
          confirmed_predictive?: boolean | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          insight_type: string
          severity?: string
          supporting_data?: Json | null
          title: string
        }
        Update: {
          actioned?: boolean
          actioned_at?: string | null
          actioned_by?: string | null
          body?: string
          confidence_score?: number
          confirmed_predictive?: boolean | null
          created_at?: string
          engagement_id?: string | null
          id?: string
          insight_type?: string
          severity?: string
          supporting_data?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_insights_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          engagement_id: string
          id: string
          issue_type: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id: string
          id?: string
          issue_type?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string
          id?: string
          issue_type?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      login_events: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          email: string | null
          id: string
          ip_address: string | null
          is_new_device: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          is_new_device?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          is_new_device?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_intelligence: {
        Row: {
          embedding: string | null
          id: string
          ingested_at: string
          published_at: string | null
          raw_data: Json | null
          relevant_categories: string[] | null
          relevant_states: string[] | null
          source: string
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          embedding?: string | null
          id?: string
          ingested_at?: string
          published_at?: string | null
          raw_data?: Json | null
          relevant_categories?: string[] | null
          relevant_states?: string[] | null
          source: string
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          embedding?: string | null
          id?: string
          ingested_at?: string
          published_at?: string | null
          raw_data?: Json | null
          relevant_categories?: string[] | null
          relevant_states?: string[] | null
          source?: string
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      mission_closeout: {
        Row: {
          created_at: string
          created_by: string | null
          engagement_id: string
          final_score: number | null
          id: string
          improvements: string | null
          institutional_notes: string | null
          key_decisions: string | null
          lessons_learned: string | null
          outcome: string | null
          strengths: string | null
          updated_at: string
          win_loss: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engagement_id: string
          final_score?: number | null
          id?: string
          improvements?: string | null
          institutional_notes?: string | null
          key_decisions?: string | null
          lessons_learned?: string | null
          outcome?: string | null
          strengths?: string | null
          updated_at?: string
          win_loss?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          final_score?: number | null
          id?: string
          improvements?: string | null
          institutional_notes?: string | null
          key_decisions?: string | null
          lessons_learned?: string | null
          outcome?: string | null
          strengths?: string | null
          updated_at?: string
          win_loss?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_closeout_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_strategic_signals: {
        Row: {
          acknowledged_at: string | null
          affected_programs: string[] | null
          affected_states: string[] | null
          classification: string
          confidence_score: number | null
          created_at: string
          engagement_id: string
          id: string
          last_updated_at: string
          published_at: string | null
          recommended_action: string | null
          resolved_at: string | null
          source_id: string
          source_name: string | null
          source_table: string
          source_url: string | null
          status: string
          strategic_relevance: number | null
          summary: string | null
          title: string
          urgency_score: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          affected_programs?: string[] | null
          affected_states?: string[] | null
          classification?: string
          confidence_score?: number | null
          created_at?: string
          engagement_id: string
          id?: string
          last_updated_at?: string
          published_at?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          source_id: string
          source_name?: string | null
          source_table: string
          source_url?: string | null
          status?: string
          strategic_relevance?: number | null
          summary?: string | null
          title: string
          urgency_score?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          affected_programs?: string[] | null
          affected_states?: string[] | null
          classification?: string
          confidence_score?: number | null
          created_at?: string
          engagement_id?: string
          id?: string
          last_updated_at?: string
          published_at?: string | null
          recommended_action?: string | null
          resolved_at?: string | null
          source_id?: string
          source_name?: string | null
          source_table?: string
          source_url?: string | null
          status?: string
          strategic_relevance?: number | null
          summary?: string | null
          title?: string
          urgency_score?: number | null
        }
        Relationships: []
      }
      mission_workflow_steps: {
        Row: {
          completed_at: string | null
          created_at: string
          engagement_id: string
          id: string
          is_complete: boolean
          step_name: string
          step_order: number
          step_type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          engagement_id: string
          id?: string
          is_complete?: boolean
          step_name: string
          step_order?: number
          step_type?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          engagement_id?: string
          id?: string
          is_complete?: boolean
          step_name?: string
          step_order?: number
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_workflow_steps_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_targets: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          target_type: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          target_type: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          target_type?: string
          value?: string
        }
        Relationships: []
      }
      nudges: {
        Row: {
          created_at: string
          engagement_id: string
          id: string
          read: boolean
          recipient_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          id?: string
          read?: boolean
          recipient_id: string
          sender_id: string
          sender_name: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          id?: string
          read?: boolean
          recipient_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      partnerships: {
        Row: {
          commitment: string | null
          contact: string | null
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          notes: string | null
          partner_name: string
          role: string | null
        }
        Insert: {
          commitment?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          notes?: string | null
          partner_name: string
          role?: string | null
        }
        Update: {
          commitment?: string | null
          contact?: string | null
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          notes?: string | null
          partner_name?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partnerships_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_horizon: {
        Row: {
          affected_competitors: string[] | null
          affected_programs: string[] | null
          affected_states: string[] | null
          confidence_score: number | null
          horizon_category: string | null
          id: string
          ingested_at: string
          iris_action: string | null
          iris_detail: string | null
          iris_headline: string | null
          iris_processed_at: string | null
          iris_type: string | null
          is_mission_specific: boolean
          market_intelligence_id: string | null
          published_at: string | null
          source: string | null
          source_type: string | null
          source_url: string | null
          status: string
          strategic_relevance: number | null
          summary: string | null
          title: string
          urgency_score: number | null
        }
        Insert: {
          affected_competitors?: string[] | null
          affected_programs?: string[] | null
          affected_states?: string[] | null
          confidence_score?: number | null
          horizon_category?: string | null
          id?: string
          ingested_at?: string
          iris_action?: string | null
          iris_detail?: string | null
          iris_headline?: string | null
          iris_processed_at?: string | null
          iris_type?: string | null
          is_mission_specific?: boolean
          market_intelligence_id?: string | null
          published_at?: string | null
          source?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          strategic_relevance?: number | null
          summary?: string | null
          title: string
          urgency_score?: number | null
        }
        Update: {
          affected_competitors?: string[] | null
          affected_programs?: string[] | null
          affected_states?: string[] | null
          confidence_score?: number | null
          horizon_category?: string | null
          id?: string
          ingested_at?: string
          iris_action?: string | null
          iris_detail?: string | null
          iris_headline?: string | null
          iris_processed_at?: string | null
          iris_type?: string | null
          is_mission_specific?: boolean
          market_intelligence_id?: string | null
          published_at?: string | null
          source?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string
          strategic_relevance?: number | null
          summary?: string | null
          title?: string
          urgency_score?: number | null
        }
        Relationships: []
      }
      pipeline_horizon_missions: {
        Row: {
          created_at: string
          engagement_id: string
          horizon_id: string
          id: string
          match_reason: string | null
          match_score: number | null
        }
        Insert: {
          created_at?: string
          engagement_id: string
          horizon_id: string
          id?: string
          match_reason?: string | null
          match_score?: number | null
        }
        Update: {
          created_at?: string
          engagement_id?: string
          horizon_id?: string
          id?: string
          match_reason?: string | null
          match_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_horizon_missions_horizon_id_fkey"
            columns: ["horizon_id"]
            isOneToOne: false
            referencedRelation: "pipeline_horizon"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_intelligence: {
        Row: {
          cfr_reference: string | null
          created_at: string
          effective_date: string | null
          full_text: string | null
          id: string
          policy_type: string
          published_date: string | null
          relevant_program_areas: string[]
          relevant_states: string[]
          source: string
          source_detail: string | null
          summary: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          cfr_reference?: string | null
          created_at?: string
          effective_date?: string | null
          full_text?: string | null
          id?: string
          policy_type: string
          published_date?: string | null
          relevant_program_areas?: string[]
          relevant_states?: string[]
          source: string
          source_detail?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          cfr_reference?: string | null
          created_at?: string
          effective_date?: string | null
          full_text?: string | null
          id?: string
          policy_type?: string
          published_date?: string | null
          relevant_program_areas?: string[]
          relevant_states?: string[]
          source?: string
          source_detail?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      policy_section_mappings: {
        Row: {
          ai_generated: boolean
          confirmed: boolean
          created_at: string
          engagement_id: string
          id: string
          policy_id: string
          question_id: string | null
          section_id: string | null
          updated_at: string
          writer_acknowledged: boolean
          writing_implication: string | null
        }
        Insert: {
          ai_generated?: boolean
          confirmed?: boolean
          created_at?: string
          engagement_id: string
          id?: string
          policy_id: string
          question_id?: string | null
          section_id?: string | null
          updated_at?: string
          writer_acknowledged?: boolean
          writing_implication?: string | null
        }
        Update: {
          ai_generated?: boolean
          confirmed?: boolean
          created_at?: string
          engagement_id?: string
          id?: string
          policy_id?: string
          question_id?: string | null
          section_id?: string | null
          updated_at?: string
          writer_acknowledged?: boolean
          writing_implication?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "policy_section_mappings_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_section_mappings_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policy_intelligence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_section_mappings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "rfp_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_section_mappings_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "heatmap_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      presence: {
        Row: {
          availability_status: string
          engagement_id: string
          last_seen: string
          member_id: string
          user_id: string
        }
        Insert: {
          availability_status?: string
          engagement_id: string
          last_seen?: string
          member_id: string
          user_id: string
        }
        Update: {
          availability_status?: string
          engagement_id?: string
          last_seen?: string
          member_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string
          email: string | null
          id: string
          is_platform_admin: boolean
          title: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          email?: string | null
          id: string
          is_platform_admin?: boolean
          title?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          is_platform_admin?: boolean
          title?: string | null
        }
        Relationships: []
      }
      quality_signals: {
        Row: {
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          leadership_needed: boolean
          notes: string | null
          quality: string
          section_name: string
          submitted_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          leadership_needed?: boolean
          notes?: string | null
          quality?: string
          section_name: string
          submitted_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          leadership_needed?: boolean
          notes?: string | null
          quality?: string
          section_name?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_signals_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      question_confidence_checks: {
        Row: {
          concerns: string | null
          confidence_score: number
          created_at: string
          engagement_id: string
          health_status: string
          id: string
          observations: string | null
          question_id: string
          recommendations: string | null
          reviewer: string
        }
        Insert: {
          concerns?: string | null
          confidence_score: number
          created_at?: string
          engagement_id: string
          health_status: string
          id?: string
          observations?: string | null
          question_id: string
          recommendations?: string | null
          reviewer: string
        }
        Update: {
          concerns?: string | null
          confidence_score?: number
          created_at?: string
          engagement_id?: string
          health_status?: string
          id?: string
          observations?: string | null
          question_id?: string
          recommendations?: string | null
          reviewer?: string
        }
        Relationships: []
      }
      question_reviews: {
        Row: {
          created_at: string
          engagement_id: string
          id: string
          max_score: number | null
          notes: string | null
          question_id: string
          recommendations: string | null
          review_date: string | null
          review_type: string
          reviewer_name: string
          risks: string | null
          score: number | null
        }
        Insert: {
          created_at?: string
          engagement_id: string
          id?: string
          max_score?: number | null
          notes?: string | null
          question_id: string
          recommendations?: string | null
          review_date?: string | null
          review_type: string
          reviewer_name: string
          risks?: string | null
          score?: number | null
        }
        Update: {
          created_at?: string
          engagement_id?: string
          id?: string
          max_score?: number | null
          notes?: string | null
          question_id?: string
          recommendations?: string | null
          review_date?: string | null
          review_type?: string
          reviewer_name?: string
          risks?: string | null
          score?: number | null
        }
        Relationships: []
      }
      question_timeline: {
        Row: {
          actor: string | null
          created_at: string
          description: string | null
          engagement_id: string
          event_type: string
          id: string
          metadata: Json | null
          question_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          description?: string | null
          engagement_id: string
          event_type: string
          id?: string
          metadata?: Json | null
          question_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          description?: string | null
          engagement_id?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          question_id?: string
        }
        Relationships: []
      }
      quick_chats: {
        Row: {
          created_at: string
          engagement_id: string
          expires_at: string
          id: string
          message: string
          read: boolean
          recipient_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          expires_at?: string
          id?: string
          message: string
          read?: boolean
          recipient_id: string
          sender_id: string
          sender_name: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          expires_at?: string
          id?: string
          message?: string
          read?: boolean
          recipient_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      resource_health: {
        Row: {
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          notes: string | null
          sme_engagement: string
          staffing: string
          submitted_by: string
          timeline_status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          notes?: string | null
          sme_engagement?: string
          staffing?: string
          submitted_by?: string
          timeline_status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          notes?: string | null
          sme_engagement?: string
          staffing?: string
          submitted_by?: string
          timeline_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_health_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_evaluation_criteria: {
        Row: {
          created_at: string
          created_by: string | null
          criterion: string
          engagement_id: string
          id: string
          notes: string | null
          sort_order: number
          updated_at: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criterion: string
          engagement_id: string
          id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criterion?: string
          engagement_id?: string
          id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfp_evaluation_criteria_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_questions: {
        Row: {
          assigned_sme: string | null
          assigned_to: string | null
          assigned_writer: string | null
          body: string
          created_at: string
          due_date: string | null
          engagement_id: string
          evaluation_weight_pct: number | null
          health: string | null
          health_score: number | null
          id: string
          latest_review_score: number | null
          open_issues: number | null
          owner: string | null
          page_limit: number | null
          policy_flagged: boolean
          question_number: string | null
          section_id: string | null
          sme_confirmed: boolean | null
          sort_order: number
          source_url: string | null
          status: string | null
          title: string | null
          updated_at: string
          writer_confidence: number | null
        }
        Insert: {
          assigned_sme?: string | null
          assigned_to?: string | null
          assigned_writer?: string | null
          body: string
          created_at?: string
          due_date?: string | null
          engagement_id: string
          evaluation_weight_pct?: number | null
          health?: string | null
          health_score?: number | null
          id?: string
          latest_review_score?: number | null
          open_issues?: number | null
          owner?: string | null
          page_limit?: number | null
          policy_flagged?: boolean
          question_number?: string | null
          section_id?: string | null
          sme_confirmed?: boolean | null
          sort_order?: number
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          writer_confidence?: number | null
        }
        Update: {
          assigned_sme?: string | null
          assigned_to?: string | null
          assigned_writer?: string | null
          body?: string
          created_at?: string
          due_date?: string | null
          engagement_id?: string
          evaluation_weight_pct?: number | null
          health?: string | null
          health_score?: number | null
          id?: string
          latest_review_score?: number | null
          open_issues?: number | null
          owner?: string | null
          page_limit?: number | null
          policy_flagged?: boolean
          question_number?: string | null
          section_id?: string | null
          sme_confirmed?: boolean | null
          sort_order?: number
          source_url?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          writer_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfp_questions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "engagement_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_questions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfp_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "heatmap_sections"
            referencedColumns: ["id"]
          },
        ]
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
      saved_insights: {
        Row: {
          answer: string
          engagement_id: string | null
          id: string
          question: string
          saved_at: string
          scope: string
          sources: Json
          user_id: string
        }
        Insert: {
          answer: string
          engagement_id?: string | null
          id?: string
          question: string
          saved_at?: string
          scope?: string
          sources?: Json
          user_id?: string
        }
        Update: {
          answer?: string
          engagement_id?: string | null
          id?: string
          question?: string
          saved_at?: string
          scope?: string
          sources?: Json
          user_id?: string
        }
        Relationships: []
      }
      section_assignments: {
        Row: {
          created_at: string
          due_date: string | null
          engagement_id: string
          id: string
          section_id: string
          status: string
          updated_at: string
          user_id: string
          word_count_max: number | null
          word_count_min: number | null
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          engagement_id: string
          id?: string
          section_id: string
          status?: string
          updated_at?: string
          user_id: string
          word_count_max?: number | null
          word_count_min?: number | null
        }
        Update: {
          created_at?: string
          due_date?: string | null
          engagement_id?: string
          id?: string
          section_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          word_count_max?: number | null
          word_count_min?: number | null
        }
        Relationships: []
      }
      section_drafts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          engagement_id: string
          id: string
          return_note: string | null
          section_id: string
          status: string
          updated_at: string
          version: number
          word_count: number
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          engagement_id: string
          id?: string
          return_note?: string | null
          section_id: string
          status?: string
          updated_at?: string
          version?: number
          word_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          engagement_id?: string
          id?: string
          return_note?: string | null
          section_id?: string
          status?: string
          updated_at?: string
          version?: number
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "section_drafts_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_drafts_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "heatmap_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      section_threads: {
        Row: {
          author_name: string
          created_at: string
          engagement_id: string
          id: string
          member_id: string
          message: string
          section_id: string
        }
        Insert: {
          author_name: string
          created_at?: string
          engagement_id: string
          id?: string
          member_id: string
          message: string
          section_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          engagement_id?: string
          id?: string
          member_id?: string
          message?: string
          section_id?: string
        }
        Relationships: []
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
          created_by: string | null
          description: string
          engagement_id: string
          id: string
          owner_name: string | null
          recommended_action: string | null
          request_type: string
          resolved_at: string | null
          severity: string
          status: string
          submitted_by: string | null
          submitter_name: string | null
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description: string
          engagement_id: string
          id?: string
          owner_name?: string | null
          recommended_action?: string | null
          request_type?: string
          resolved_at?: string | null
          severity: string
          status?: string
          submitted_by?: string | null
          submitter_name?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          engagement_id?: string
          id?: string
          owner_name?: string | null
          recommended_action?: string | null
          request_type?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          submitted_by?: string | null
          submitter_name?: string | null
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
      stakeholders: {
        Row: {
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          name: string
          notes: string | null
          organization: string | null
          priority: string | null
          relationship: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          name: string
          notes?: string | null
          organization?: string | null
          priority?: string | null
          relationship?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          name?: string
          notes?: string | null
          organization?: string | null
          priority?: string | null
          relationship?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stakeholders_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      state_market_data: {
        Row: {
          data_year: string | null
          managed_care_pct: number | null
          medicaid_enrollment: number | null
          source_url: string | null
          state: string
          updated_at: string
        }
        Insert: {
          data_year?: string | null
          managed_care_pct?: number | null
          medicaid_enrollment?: number | null
          source_url?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          data_year?: string | null
          managed_care_pct?: number | null
          medicaid_enrollment?: number | null
          source_url?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      state_resources: {
        Row: {
          medicaid_agency_url: string | null
          notes: string | null
          procurement_portal_url: string | null
          small_business_program: string | null
          state: string
          state_name: string
          updated_at: string
        }
        Insert: {
          medicaid_agency_url?: string | null
          notes?: string | null
          procurement_portal_url?: string | null
          small_business_program?: string | null
          state: string
          state_name: string
          updated_at?: string
        }
        Update: {
          medicaid_agency_url?: string | null
          notes?: string | null
          procurement_portal_url?: string | null
          small_business_program?: string | null
          state?: string
          state_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      state_trivia_bank: {
        Row: {
          choices: string[]
          correct_index: number
          created_at: string
          explanation: string | null
          id: string
          question: string
          state: string
        }
        Insert: {
          choices: string[]
          correct_index: number
          created_at?: string
          explanation?: string | null
          id?: string
          question: string
          state: string
        }
        Update: {
          choices?: string[]
          correct_index?: number
          created_at?: string
          explanation?: string | null
          id?: string
          question?: string
          state?: string
        }
        Relationships: []
      }
      stuck_flags: {
        Row: {
          created_at: string
          engagement_id: string
          id: string
          member_id: string
          resolved: boolean
          resolved_at: string | null
          section_id: string | null
          section_name: string
          user_id: string
          writer_name: string
        }
        Insert: {
          created_at?: string
          engagement_id: string
          id?: string
          member_id: string
          resolved?: boolean
          resolved_at?: string | null
          section_id?: string | null
          section_name: string
          user_id: string
          writer_name: string
        }
        Update: {
          created_at?: string
          engagement_id?: string
          id?: string
          member_id?: string
          resolved?: boolean
          resolved_at?: string | null
          section_id?: string | null
          section_name?: string
          user_id?: string
          writer_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stuck_flags_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "heatmap_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      support_requests: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          engagement_id: string
          id: string
          priority: string
          status: string
          submitted_by: string
          updated_at: string
          what_is_needed: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          engagement_id: string
          id?: string
          priority?: string
          status?: string
          submitted_by?: string
          updated_at?: string
          what_is_needed?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          engagement_id?: string
          id?: string
          priority?: string
          status?: string
          submitted_by?: string
          updated_at?: string
          what_is_needed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_engagement_id_fkey"
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
      terminology: {
        Row: {
          context: string | null
          created_at: string
          created_by: string | null
          definition: string | null
          engagement_id: string
          id: string
          preferred_usage: string | null
          term: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          engagement_id: string
          id?: string
          preferred_usage?: string | null
          term: string
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          engagement_id?: string
          id?: string
          preferred_usage?: string | null
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminology_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      trivia_answers: {
        Row: {
          answered_at: string
          correct: boolean
          engagement_id: string
          id: string
          member_id: string
          question_day: number
          user_id: string
        }
        Insert: {
          answered_at?: string
          correct: boolean
          engagement_id: string
          id?: string
          member_id: string
          question_day: number
          user_id: string
        }
        Update: {
          answered_at?: string
          correct?: boolean
          engagement_id?: string
          id?: string
          member_id?: string
          question_day?: number
          user_id?: string
        }
        Relationships: []
      }
      trivia_winners: {
        Row: {
          declared_at: string
          declared_by: string
          declared_by_name: string
          engagement_id: string
          id: string
          message: string | null
          prize: string | null
          winner_member_id: string
          winner_name: string
        }
        Insert: {
          declared_at?: string
          declared_by: string
          declared_by_name: string
          engagement_id: string
          id?: string
          message?: string | null
          prize?: string | null
          winner_member_id: string
          winner_name: string
        }
        Update: {
          declared_at?: string
          declared_by?: string
          declared_by_name?: string
          engagement_id?: string
          id?: string
          message?: string | null
          prize?: string | null
          winner_member_id?: string
          winner_name?: string
        }
        Relationships: []
      }
      web_research_cache: {
        Row: {
          cache_key: string
          category: string
          created_at: string
          expires_at: string
          id: string
          query: string
          result: Json
          source_urls: string[] | null
        }
        Insert: {
          cache_key: string
          category: string
          created_at?: string
          expires_at?: string
          id?: string
          query: string
          result: Json
          source_urls?: string[] | null
        }
        Update: {
          cache_key?: string
          category?: string
          created_at?: string
          expires_at?: string
          id?: string
          query?: string
          result?: Json
          source_urls?: string[] | null
        }
        Relationships: []
      }
      win_of_the_day: {
        Row: {
          body: string | null
          engagement_id: string
          id: string
          posted_at: string
          posted_by: string | null
          posted_by_name: string
          title: string
        }
        Insert: {
          body?: string | null
          engagement_id: string
          id?: string
          posted_at?: string
          posted_by?: string | null
          posted_by_name: string
          title: string
        }
        Update: {
          body?: string | null
          engagement_id?: string
          id?: string
          posted_at?: string
          posted_by?: string | null
          posted_by_name?: string
          title?: string
        }
        Relationships: []
      }
      win_theme_mappings: {
        Row: {
          ai_similarity: number | null
          ai_suggested: boolean
          confirmed: boolean
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          question_id: string | null
          section_id: string | null
          updated_at: string
          win_theme_id: string
          writer_hint: string | null
        }
        Insert: {
          ai_similarity?: number | null
          ai_suggested?: boolean
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          question_id?: string | null
          section_id?: string | null
          updated_at?: string
          win_theme_id: string
          writer_hint?: string | null
        }
        Update: {
          ai_similarity?: number | null
          ai_suggested?: boolean
          confirmed?: boolean
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          question_id?: string | null
          section_id?: string | null
          updated_at?: string
          win_theme_id?: string
          writer_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "win_theme_mappings_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "win_theme_mappings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "rfp_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "win_theme_mappings_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "heatmap_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "win_theme_mappings_win_theme_id_fkey"
            columns: ["win_theme_id"]
            isOneToOne: false
            referencedRelation: "win_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      win_themes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          engagement_id: string
          evidence: string | null
          id: string
          owner: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id: string
          evidence?: string | null
          id?: string
          owner?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          engagement_id?: string
          evidence?: string | null
          id?: string
          owner?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      work_log: {
        Row: {
          created_at: string
          description: string
          engagement_id: string
          id: string
          section: string | null
          time_spent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          engagement_id: string
          id?: string
          section?: string | null
          time_spent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          engagement_id?: string
          id?: string
          section?: string | null
          time_spent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      writer_confidence: {
        Row: {
          confidence: number
          created_at: string
          created_by: string | null
          engagement_id: string
          id: string
          needs_help: boolean
          notes: string | null
          section_name: string
          writer: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          engagement_id: string
          id?: string
          needs_help?: boolean
          notes?: string | null
          section_name: string
          writer?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          created_by?: string | null
          engagement_id?: string
          id?: string
          needs_help?: boolean
          notes?: string | null
          section_name?: string
          writer?: string
        }
        Relationships: [
          {
            foreignKeyName: "writer_confidence_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      writer_last_seen: {
        Row: {
          engagement_id: string
          id: string
          last_seen_at: string
          streak_count: number
          streak_last_day: string
          user_id: string
        }
        Insert: {
          engagement_id: string
          id?: string
          last_seen_at?: string
          streak_count?: number
          streak_last_day?: string
          user_id: string
        }
        Update: {
          engagement_id?: string
          id?: string
          last_seen_at?: string
          streak_count?: number
          streak_last_day?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      call_hook: { Args: { path: string }; Returns: undefined }
      cleanup_quick_chats: { Args: never; Returns: undefined }
      current_user_is_admin_or_founder: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_engagement_compliance_score: {
        Args: { _engagement_id: string }
        Returns: number
      }
      get_engagement_member_contacts: {
        Args: { _engagement_id: string }
        Returns: {
          display_name: string
          email: string
          phone: string
          slack_handle: string
          user_id: string
        }[]
      }
      get_engagement_slack_webhook: {
        Args: { _engagement_id: string }
        Returns: string
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      leadership_count: { Args: { _engagement_id: string }; Returns: number }
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
      record_hook_failure: {
        Args: {
          _error: string
          _hook_name: string
          _payload?: Json
          _source: string
          _status: number
        }
        Returns: string
      }
      scan_cron_failures: { Args: { _since?: string }; Returns: number }
      search_similar_content: {
        Args: {
          match_count?: number
          match_engagement_id?: string
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content_text: string
          engagement_id: string
          similarity: number
          source_id: string
          source_table: string
        }[]
      }
      search_similar_market_intel: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
          source: string
          summary: string
          title: string
          url: string
        }[]
      }
      seed_state_intel: {
        Args: { _engagement_id: string; _state: string }
        Returns: undefined
      }
      user_has_any_leadership_role: {
        Args: { _user_id: string }
        Returns: boolean
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
