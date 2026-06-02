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
      alignment_conflicts: {
        Row: {
          conflict_type: string
          description: string
          detected_at: string | null
          id: string
          iris_recommendation: string | null
          mission_id: string
          question_a_id: string
          question_b_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
        }
        Insert: {
          conflict_type: string
          description: string
          detected_at?: string | null
          id?: string
          iris_recommendation?: string | null
          mission_id: string
          question_a_id: string
          question_b_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
        }
        Update: {
          conflict_type?: string
          description?: string
          detected_at?: string | null
          id?: string
          iris_recommendation?: string | null
          mission_id?: string
          question_a_id?: string
          question_b_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alignment_conflicts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alignment_conflicts_question_a_id_fkey"
            columns: ["question_a_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alignment_conflicts_question_b_id_fkey"
            columns: ["question_b_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alignment_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_book_section_history: {
        Row: {
          content: string | null
          generated_at: string
          generated_by: string
          id: string
          mission_id: string
          section_id: string | null
          section_key: string
          sources: Json
          version_number: number
        }
        Insert: {
          content?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          mission_id: string
          section_id?: string | null
          section_key: string
          sources?: Json
          version_number: number
        }
        Update: {
          content?: string | null
          generated_at?: string
          generated_by?: string
          id?: string
          mission_id?: string
          section_id?: string | null
          section_key?: string
          sources?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "briefing_book_section_history_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "briefing_book_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_book_sections: {
        Row: {
          content: string | null
          created_at: string
          generated_at: string | null
          id: string
          mission_id: string
          section_key: string
          sources: Json
          status: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          mission_id: string
          section_key: string
          sources?: Json
          status?: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          content?: string | null
          created_at?: string
          generated_at?: string | null
          id?: string
          mission_id?: string
          section_key?: string
          sources?: Json
          status?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          created_at: string | null
          from_name: string
          id: string
          mission_id: string | null
          slack_delivered_at: string | null
          slack_delivery_status: string
          slack_error: string | null
          text: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          from_name: string
          id?: string
          mission_id?: string | null
          slack_delivered_at?: string | null
          slack_delivery_status?: string
          slack_error?: string | null
          text: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          from_name?: string
          id?: string
          mission_id?: string | null
          slack_delivered_at?: string | null
          slack_delivery_status?: string
          slack_error?: string | null
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      embeddings: {
        Row: {
          content_text: string
          created_at: string | null
          embedding: string | null
          id: string
          mission_id: string | null
          source_id: string
          source_table: string
        }
        Insert: {
          content_text: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          mission_id?: string | null
          source_id: string
          source_table: string
        }
        Update: {
          content_text?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          mission_id?: string | null
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "embeddings_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      escalations: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          mission_id: string
          question_id: string | null
          severity: string
          status: string | null
          submitted_by: string
          submitted_by_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          id?: string
          mission_id: string
          question_id?: string | null
          severity: string
          status?: string | null
          submitted_by: string
          submitted_by_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          mission_id?: string
          question_id?: string | null
          severity?: string
          status?: string | null
          submitted_by?: string
          submitted_by_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalations_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalations_submitted_by_id_fkey"
            columns: ["submitted_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      iris_brief_cache: {
        Row: {
          brief_text: string
          expires_at: string | null
          generated_at: string | null
          id: string
          ref_id: string | null
          scope: string
          user_id: string | null
        }
        Insert: {
          brief_text: string
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          ref_id?: string | null
          scope: string
          user_id?: string | null
        }
        Update: {
          brief_text?: string
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          ref_id?: string | null
          scope?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iris_brief_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_intelligence: {
        Row: {
          category: string | null
          created_at: string
          id: string
          published_at: string | null
          source: string
          summary: string | null
          title: string
          type: string
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          source: string
          summary?: string | null
          title: string
          type?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          source?: string
          summary?: string | null
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      mission_assumptions: {
        Row: {
          assumption: string
          confidence_score: number | null
          created_at: string
          id: string
          last_validated_date: string | null
          mission_id: string
          next_validation_step: string | null
          owner_id: string | null
          risk_if_wrong: string | null
          status: string
          supporting_evidence: string | null
          updated_at: string
        }
        Insert: {
          assumption: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_validated_date?: string | null
          mission_id: string
          next_validation_step?: string | null
          owner_id?: string | null
          risk_if_wrong?: string | null
          status?: string
          supporting_evidence?: string | null
          updated_at?: string
        }
        Update: {
          assumption?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_validated_date?: string | null
          mission_id?: string
          next_validation_step?: string | null
          owner_id?: string | null
          risk_if_wrong?: string | null
          status?: string
          supporting_evidence?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_decisions: {
        Row: {
          created_at: string | null
          decided_at: string | null
          id: string
          mission_id: string
          owner: string | null
          question_id: string | null
          rationale: string | null
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          decided_at?: string | null
          id?: string
          mission_id: string
          owner?: string | null
          question_id?: string | null
          rationale?: string | null
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          decided_at?: string | null
          id?: string
          mission_id?: string
          owner?: string | null
          question_id?: string | null
          rationale?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_decisions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_decisions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_intelligence_scores: {
        Row: {
          created_at: string
          id: string
          intelligence_id: string
          iris_insight: string | null
          matched_questions: string[] | null
          matched_themes: string[] | null
          mission_id: string
          score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intelligence_id: string
          iris_insight?: string | null
          matched_questions?: string[] | null
          matched_themes?: string[] | null
          mission_id: string
          score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intelligence_id?: string
          iris_insight?: string | null
          matched_questions?: string[] | null
          matched_themes?: string[] | null
          mission_id?: string
          score?: number
          updated_at?: string
        }
        Relationships: []
      }
      mission_library: {
        Row: {
          added_by: string | null
          added_by_id: string | null
          category: string
          created_at: string | null
          file_hash: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_rfp: boolean | null
          mission_id: string
          name: string
          notes: string | null
          url: string | null
        }
        Insert: {
          added_by?: string | null
          added_by_id?: string | null
          category: string
          created_at?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_rfp?: boolean | null
          mission_id: string
          name: string
          notes?: string | null
          url?: string | null
        }
        Update: {
          added_by?: string | null
          added_by_id?: string | null
          category?: string
          created_at?: string | null
          file_hash?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_rfp?: boolean | null
          mission_id?: string
          name?: string
          notes?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_library_added_by_id_fkey"
            columns: ["added_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_library_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_members: {
        Row: {
          display_name: string | null
          id: string
          joined_at: string | null
          mission_id: string
          role: string
          user_id: string
        }
        Insert: {
          display_name?: string | null
          id?: string
          joined_at?: string | null
          mission_id: string
          role?: string
          user_id: string
        }
        Update: {
          display_name?: string | null
          id?: string
          joined_at?: string | null
          mission_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_members_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_review_gates: {
        Row: {
          created_at: string | null
          description: string | null
          gate_name: string
          gate_order: number
          id: string
          mission_id: string
          target_date: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gate_name: string
          gate_order: number
          id?: string
          mission_id: string
          target_date?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gate_name?: string
          gate_order?: number
          id?: string
          mission_id?: string
          target_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_review_gates_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_risks: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          mission_id: string
          owner: string | null
          question_id: string | null
          severity: string | null
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          mission_id: string
          owner?: string | null
          question_id?: string | null
          severity?: string | null
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          mission_id?: string
          owner?: string | null
          question_id?: string | null
          severity?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_risks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_risks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          client: string
          competitors: string[] | null
          created_at: string | null
          created_by: string | null
          description: string | null
          health: string | null
          id: string
          name: string
          priority_topics: string[] | null
          program_type: string | null
          question_count: number | null
          rfp_parsed: boolean | null
          slack_webhook: string | null
          state: string | null
          status: string | null
          submission_date: string | null
          win_themes: string[] | null
        }
        Insert: {
          client: string
          competitors?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          health?: string | null
          id?: string
          name: string
          priority_topics?: string[] | null
          program_type?: string | null
          question_count?: number | null
          rfp_parsed?: boolean | null
          slack_webhook?: string | null
          state?: string | null
          status?: string | null
          submission_date?: string | null
          win_themes?: string[] | null
        }
        Update: {
          client?: string
          competitors?: string[] | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          health?: string | null
          id?: string
          name?: string
          priority_topics?: string[] | null
          program_type?: string | null
          question_count?: number | null
          rfp_parsed?: boolean | null
          slack_webhook?: string | null
          state?: string | null
          status?: string | null
          submission_date?: string | null
          win_themes?: string[] | null
        }
        Relationships: []
      }
      olympus_audit_log: {
        Row: {
          action_summary: string
          action_type: string
          created_at: string
          id: string
          metadata: Json | null
          mission_id: string | null
          target_id: string | null
          target_table: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_summary: string
          action_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_summary?: string
          action_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          target_id?: string | null
          target_table?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          created_at: string | null
          display_name: string
          email: string | null
          id: string
          last_seen_signals_at: string | null
        }
        Insert: {
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          email?: string | null
          id: string
          last_seen_signals_at?: string | null
        }
        Update: {
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          last_seen_signals_at?: string | null
        }
        Relationships: []
      }
      question_collaboration: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string | null
          entry_type: string
          id: string
          mission_id: string
          question_id: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string | null
          entry_type: string
          id?: string
          mission_id: string
          question_id: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string | null
          entry_type?: string
          id?: string
          mission_id?: string
          question_id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_collaboration_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_collaboration_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_collaboration_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_collaboration_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_gate_status: {
        Row: {
          completed_at: string | null
          entered_at: string | null
          gate_id: string
          id: string
          question_id: string
          reviewer_notes: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          entered_at?: string | null
          gate_id: string
          id?: string
          question_id: string
          reviewer_notes?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          entered_at?: string | null
          gate_id?: string
          id?: string
          question_id?: string
          reviewer_notes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_gate_status_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "mission_review_gates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_gate_status_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
      }
      question_intelligence: {
        Row: {
          competitor_signals: string | null
          compliance_flags: string[] | null
          expires_at: string | null
          generated_at: string | null
          id: string
          iris_brief: string | null
          key_messages: string[] | null
          mission_id: string
          procurement_priorities: string | null
          question_id: string
          relevant_research: string[] | null
          state_priorities: string | null
        }
        Insert: {
          competitor_signals?: string | null
          compliance_flags?: string[] | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          iris_brief?: string | null
          key_messages?: string[] | null
          mission_id: string
          procurement_priorities?: string | null
          question_id: string
          relevant_research?: string[] | null
          state_priorities?: string | null
        }
        Update: {
          competitor_signals?: string | null
          compliance_flags?: string[] | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          iris_brief?: string | null
          key_messages?: string[] | null
          mission_id?: string
          procurement_priorities?: string | null
          question_id?: string
          relevant_research?: string[] | null
          state_priorities?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_intelligence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_intelligence_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
      }
      question_records: {
        Row: {
          assigned_sme_id: string | null
          assigned_writer_id: string | null
          created_at: string | null
          current_focus: string | null
          current_score: number | null
          estimated_hours: number | null
          evaluation_weight: number | null
          formatting_rules: string | null
          guidance: string | null
          health: string | null
          health_drivers: Json | null
          id: string
          mandatory_language: string[] | null
          mission_id: string
          next_step: string | null
          page_limit: number | null
          pens_down_date: string | null
          question_number: string
          question_text: string
          requirements: string[] | null
          scoring_criteria: string | null
          section_number: string | null
          sort_order: number | null
          status: string | null
          target_score: number | null
          title: string
          updated_at: string | null
          waiting_on: string | null
          word_limit: number | null
        }
        Insert: {
          assigned_sme_id?: string | null
          assigned_writer_id?: string | null
          created_at?: string | null
          current_focus?: string | null
          current_score?: number | null
          estimated_hours?: number | null
          evaluation_weight?: number | null
          formatting_rules?: string | null
          guidance?: string | null
          health?: string | null
          health_drivers?: Json | null
          id?: string
          mandatory_language?: string[] | null
          mission_id: string
          next_step?: string | null
          page_limit?: number | null
          pens_down_date?: string | null
          question_number: string
          question_text: string
          requirements?: string[] | null
          scoring_criteria?: string | null
          section_number?: string | null
          sort_order?: number | null
          status?: string | null
          target_score?: number | null
          title: string
          updated_at?: string | null
          waiting_on?: string | null
          word_limit?: number | null
        }
        Update: {
          assigned_sme_id?: string | null
          assigned_writer_id?: string | null
          created_at?: string | null
          current_focus?: string | null
          current_score?: number | null
          estimated_hours?: number | null
          evaluation_weight?: number | null
          formatting_rules?: string | null
          guidance?: string | null
          health?: string | null
          health_drivers?: Json | null
          id?: string
          mandatory_language?: string[] | null
          mission_id?: string
          next_step?: string | null
          page_limit?: number | null
          pens_down_date?: string | null
          question_number?: string
          question_text?: string
          requirements?: string[] | null
          scoring_criteria?: string | null
          section_number?: string | null
          sort_order?: number | null
          status?: string | null
          target_score?: number | null
          title?: string
          updated_at?: string | null
          waiting_on?: string | null
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_records_assigned_sme_id_fkey"
            columns: ["assigned_sme_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_records_assigned_writer_id_fkey"
            columns: ["assigned_writer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_records_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_relationships: {
        Row: {
          conflict_description: string | null
          conflict_detected: boolean | null
          detected_at: string | null
          id: string
          iris_note: string | null
          mission_id: string
          question_id: string
          related_question_id: string
          relationship_type: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          conflict_description?: string | null
          conflict_detected?: boolean | null
          detected_at?: string | null
          id?: string
          iris_note?: string | null
          mission_id: string
          question_id: string
          related_question_id: string
          relationship_type: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          conflict_description?: string | null
          conflict_detected?: boolean | null
          detected_at?: string | null
          id?: string
          iris_note?: string | null
          mission_id?: string
          question_id?: string
          related_question_id?: string
          relationship_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_relationships_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_relationships_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_relationships_related_question_id_fkey"
            columns: ["related_question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_relationships_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_scores: {
        Row: {
          id: string
          question_id: string
          review_gate: string | null
          review_notes: string | null
          reviewer_id: string | null
          score: number
          score_type: string
          scored_at: string | null
        }
        Insert: {
          id?: string
          question_id: string
          review_gate?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          score: number
          score_type: string
          scored_at?: string | null
        }
        Update: {
          id?: string
          question_id?: string
          review_gate?: string | null
          review_notes?: string | null
          reviewer_id?: string | null
          score?: number
          score_type?: string
          scored_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_scores_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_scores_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reality_updates: {
        Row: {
          created_at: string
          details: string | null
          id: string
          mission_id: string
          need_type: string | null
          question_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          signal_type: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          mission_id: string
          need_type?: string | null
          question_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          signal_type: string
          user_id?: string | null
          user_name: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          mission_id?: string
          need_type?: string | null
          question_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          signal_type?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reality_updates_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          confidence: number | null
          created_at: string
          created_by_system: boolean | null
          id: string
          mission_id: string
          owner_id: string | null
          recommended_action: string | null
          related_conflict_id: string | null
          related_decision_id: string | null
          related_document_id: string | null
          related_question_id: string | null
          related_risk_id: string | null
          severity: string
          signal_summary: string | null
          signal_title: string
          signal_type: string
          source_module: string
          status: string
          tags: string[] | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by_system?: boolean | null
          id?: string
          mission_id: string
          owner_id?: string | null
          recommended_action?: string | null
          related_conflict_id?: string | null
          related_decision_id?: string | null
          related_document_id?: string | null
          related_question_id?: string | null
          related_risk_id?: string | null
          severity?: string
          signal_summary?: string | null
          signal_title: string
          signal_type: string
          source_module: string
          status?: string
          tags?: string[] | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by_system?: boolean | null
          id?: string
          mission_id?: string
          owner_id?: string | null
          recommended_action?: string | null
          related_conflict_id?: string | null
          related_decision_id?: string | null
          related_document_id?: string | null
          related_question_id?: string | null
          related_risk_id?: string | null
          severity?: string
          signal_summary?: string | null
          signal_title?: string
          signal_type?: string
          source_module?: string
          status?: string
          tags?: string[] | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
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
      win_themes: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          key_message: string | null
          mission_id: string
          question_ids: string[] | null
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          key_message?: string | null
          mission_id: string
          question_ids?: string[] | null
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          key_message?: string | null
          mission_id?: string
          question_ids?: string[] | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "win_themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "win_themes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_old_signals: { Args: never; Returns: number }
      calculate_question_health: {
        Args: { p_question_id: string }
        Returns: string
      }
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
      has_mission_role: {
        Args: { _mission_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      is_mission_member: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
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
