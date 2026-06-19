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
      admin_messages: {
        Row: {
          attachment_url: string | null
          body: string
          created_at: string
          id: string
          opened_count: number
          recipient_ids: string[]
          recipient_scope: string
          sender_id: string
          sent_at: string | null
          status: string
          subject: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          id?: string
          opened_count?: number
          recipient_ids?: string[]
          recipient_scope?: string
          sender_id: string
          sent_at?: string | null
          status?: string
          subject: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          body?: string
          created_at?: string
          id?: string
          opened_count?: number
          recipient_ids?: string[]
          recipient_scope?: string
          sender_id?: string
          sent_at?: string | null
          status?: string
          subject?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: []
      }
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
            foreignKeyName: "alignment_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alignment_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      amendment_changes: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          affected_question_ids: string[] | null
          affected_sections: string[] | null
          amendment_id: string
          change_type: string
          created_at: string
          description: string
          id: string
          mission_id: string
          severity: string
          writer_action_required: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_question_ids?: string[] | null
          affected_sections?: string[] | null
          amendment_id: string
          change_type: string
          created_at?: string
          description: string
          id?: string
          mission_id: string
          severity?: string
          writer_action_required?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          affected_question_ids?: string[] | null
          affected_sections?: string[] | null
          amendment_id?: string
          change_type?: string
          created_at?: string
          description?: string
          id?: string
          mission_id?: string
          severity?: string
          writer_action_required?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "amendment_changes_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "rfp_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_support_settings: {
        Row: {
          billing_contact_email: string | null
          id: number
          it_contact_email: string | null
          pm_contact_email: string | null
          pm_user_id: string | null
          talent_desk_quick_links: Json
          talent_desk_url: string | null
          updated_at: string
        }
        Insert: {
          billing_contact_email?: string | null
          id?: number
          it_contact_email?: string | null
          pm_contact_email?: string | null
          pm_user_id?: string | null
          talent_desk_quick_links?: Json
          talent_desk_url?: string | null
          updated_at?: string
        }
        Update: {
          billing_contact_email?: string | null
          id?: number
          it_contact_email?: string | null
          pm_contact_email?: string | null
          pm_user_id?: string | null
          talent_desk_quick_links?: Json
          talent_desk_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      athena_insight_mappings: {
        Row: {
          created_at: string
          id: string
          insight_id: string
          mission_id: string
          question_id: string | null
          scope: string
          section_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          insight_id: string
          mission_id: string
          question_id?: string | null
          scope?: string
          section_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          insight_id?: string
          mission_id?: string
          question_id?: string | null
          scope?: string
          section_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athena_insight_mappings_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "athena_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_insight_mappings_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_insight_mappings_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_insight_mappings_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "mission_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      athena_insights: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          insight_number: number | null
          insight_type: string
          is_daily_insight: boolean
          is_iris_generated: boolean
          mission_id: string
          question_id: string | null
          quote: string
          section_id: string | null
          strategic_quote: string | null
          tags: string[]
          title: string | null
          updated_at: string
          why_it_matters: string | null
          writers_note: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          insight_number?: number | null
          insight_type?: string
          is_daily_insight?: boolean
          is_iris_generated?: boolean
          mission_id: string
          question_id?: string | null
          quote: string
          section_id?: string | null
          strategic_quote?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          why_it_matters?: string | null
          writers_note?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          insight_number?: number | null
          insight_type?: string
          is_daily_insight?: boolean
          is_iris_generated?: boolean
          mission_id?: string
          question_id?: string | null
          quote?: string
          section_id?: string | null
          strategic_quote?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          why_it_matters?: string | null
          writers_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athena_insights_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_insights_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_insights_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "mission_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      athena_intelligence_map: {
        Row: {
          added_by: string | null
          applicable_populations: string[]
          applicable_programs: string[]
          applicable_states: string[]
          applicable_waivers: string[]
          created_at: string
          id: string
          is_federal: boolean
          is_verified: boolean
          notes: string | null
          oracle_category: string
          priority: string
          refresh_cadence: string
          source_name: string
          source_type: string
          source_url: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          added_by?: string | null
          applicable_populations?: string[]
          applicable_programs?: string[]
          applicable_states?: string[]
          applicable_waivers?: string[]
          created_at?: string
          id?: string
          is_federal?: boolean
          is_verified?: boolean
          notes?: string | null
          oracle_category: string
          priority?: string
          refresh_cadence?: string
          source_name: string
          source_type: string
          source_url: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          added_by?: string | null
          applicable_populations?: string[]
          applicable_programs?: string[]
          applicable_states?: string[]
          applicable_waivers?: string[]
          created_at?: string
          id?: string
          is_federal?: boolean
          is_verified?: boolean
          notes?: string | null
          oracle_category?: string
          priority?: string
          refresh_cadence?: string
          source_name?: string
          source_type?: string
          source_url?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athena_intelligence_map_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_intelligence_map_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      athena_smes: {
        Row: {
          availability: string | null
          bio: string | null
          created_at: string
          display_name: string
          email: string
          expertise_areas: string[] | null
          id: string
          is_active: boolean | null
          organization: string | null
          phone: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          availability?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          email: string
          expertise_areas?: string[] | null
          id?: string
          is_active?: boolean | null
          organization?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          availability?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          email?: string
          expertise_areas?: string[] | null
          id?: string
          is_active?: boolean | null
          organization?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athena_smes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athena_smes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_activity_log: {
        Row: {
          action: string
          id: string
          member_id: string
          metadata: Json
          performed_by: string | null
          timestamp: string
        }
        Insert: {
          action: string
          id?: string
          member_id: string
          metadata?: Json
          performed_by?: string | null
          timestamp?: string
        }
        Update: {
          action?: string
          id?: string
          member_id?: string
          metadata?: Json
          performed_by?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_activity_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_entities: {
        Row: {
          created_at: string | null
          description: string | null
          entity_name: string
          entity_type: string
          id: string
          is_active: boolean | null
          key_sources: string[] | null
          knowledge_layer: string | null
          notes: string | null
          parent_entity: string | null
          program_code: string | null
          related_entities: string[] | null
          slug: string
          state_code: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          entity_name: string
          entity_type: string
          id?: string
          is_active?: boolean | null
          key_sources?: string[] | null
          knowledge_layer?: string | null
          notes?: string | null
          parent_entity?: string | null
          program_code?: string | null
          related_entities?: string[] | null
          slug: string
          state_code?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          entity_name?: string
          entity_type?: string
          id?: string
          is_active?: boolean | null
          key_sources?: string[] | null
          knowledge_layer?: string | null
          notes?: string | null
          parent_entity?: string | null
          program_code?: string | null
          related_entities?: string[] | null
          slug?: string
          state_code?: string | null
        }
        Relationships: []
      }
      atlas_invite_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          invite_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          invite_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          invite_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_invite_tokens_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "atlas_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          contract_signed: boolean
          contract_signed_at: string | null
          contract_signed_by: string | null
          created_at: string
          display_name: string | null
          email: string
          engagement_lead_id: string | null
          expected_start_date: string | null
          id: string
          invite_sent_at: string | null
          invite_sent_by: string | null
          invited_by: string | null
          mission_id: string | null
          notes: string | null
          role: string | null
          role_hint: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_signed_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          engagement_lead_id?: string | null
          expected_start_date?: string | null
          id?: string
          invite_sent_at?: string | null
          invite_sent_by?: string | null
          invited_by?: string | null
          mission_id?: string | null
          notes?: string | null
          role?: string | null
          role_hint?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          contract_signed?: boolean
          contract_signed_at?: string | null
          contract_signed_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          engagement_lead_id?: string | null
          expected_start_date?: string | null
          id?: string
          invite_sent_at?: string | null
          invite_sent_by?: string | null
          invited_by?: string | null
          mission_id?: string | null
          notes?: string | null
          role?: string | null
          role_hint?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      atlas_knowledge_objects: {
        Row: {
          authority_score: number | null
          body: string
          created_at: string | null
          embedding: string | null
          entities_tagged: string[] | null
          id: string
          issuing_authority: string | null
          knowledge_layer: string
          last_retrieved_at: string | null
          mission_id: string | null
          object_type: string
          page_reference: string | null
          program_code: string | null
          proposal_use_case: string | null
          related_chapters: string[] | null
          related_objects: string[] | null
          related_questions: string[] | null
          retrieval_count: number | null
          section_reference: string | null
          source_id: string | null
          state_code: string | null
          tags: string[] | null
          title: string | null
          topic_category: string | null
          updated_at: string | null
          verbatim_quote: string | null
        }
        Insert: {
          authority_score?: number | null
          body: string
          created_at?: string | null
          embedding?: string | null
          entities_tagged?: string[] | null
          id?: string
          issuing_authority?: string | null
          knowledge_layer: string
          last_retrieved_at?: string | null
          mission_id?: string | null
          object_type: string
          page_reference?: string | null
          program_code?: string | null
          proposal_use_case?: string | null
          related_chapters?: string[] | null
          related_objects?: string[] | null
          related_questions?: string[] | null
          retrieval_count?: number | null
          section_reference?: string | null
          source_id?: string | null
          state_code?: string | null
          tags?: string[] | null
          title?: string | null
          topic_category?: string | null
          updated_at?: string | null
          verbatim_quote?: string | null
        }
        Update: {
          authority_score?: number | null
          body?: string
          created_at?: string | null
          embedding?: string | null
          entities_tagged?: string[] | null
          id?: string
          issuing_authority?: string | null
          knowledge_layer?: string
          last_retrieved_at?: string | null
          mission_id?: string | null
          object_type?: string
          page_reference?: string | null
          program_code?: string | null
          proposal_use_case?: string | null
          related_chapters?: string[] | null
          related_objects?: string[] | null
          related_questions?: string[] | null
          retrieval_count?: number | null
          section_reference?: string | null
          source_id?: string | null
          state_code?: string | null
          tags?: string[] | null
          title?: string | null
          topic_category?: string | null
          updated_at?: string | null
          verbatim_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_knowledge_objects_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_lessons_learned: {
        Row: {
          applies_to_programs: string[] | null
          applies_to_question_types: string[] | null
          applies_to_states: string[] | null
          authority_score: number | null
          confidence: string | null
          created_at: string | null
          id: string
          iris_memory_id: string | null
          last_applied_at: string | null
          lesson_body: string
          lesson_type: string
          promoted_at: string | null
          promoted_by: string | null
          source_mission_ids: string[] | null
          times_applied: number | null
          title: string
          updated_at: string | null
          win_or_loss: string | null
        }
        Insert: {
          applies_to_programs?: string[] | null
          applies_to_question_types?: string[] | null
          applies_to_states?: string[] | null
          authority_score?: number | null
          confidence?: string | null
          created_at?: string | null
          id?: string
          iris_memory_id?: string | null
          last_applied_at?: string | null
          lesson_body: string
          lesson_type: string
          promoted_at?: string | null
          promoted_by?: string | null
          source_mission_ids?: string[] | null
          times_applied?: number | null
          title: string
          updated_at?: string | null
          win_or_loss?: string | null
        }
        Update: {
          applies_to_programs?: string[] | null
          applies_to_question_types?: string[] | null
          applies_to_states?: string[] | null
          authority_score?: number | null
          confidence?: string | null
          created_at?: string | null
          id?: string
          iris_memory_id?: string | null
          last_applied_at?: string | null
          lesson_body?: string
          lesson_type?: string
          promoted_at?: string | null
          promoted_by?: string | null
          source_mission_ids?: string[] | null
          times_applied?: number | null
          title?: string
          updated_at?: string | null
          win_or_loss?: string | null
        }
        Relationships: []
      }
      atlas_mission_moments: {
        Row: {
          active_date: string
          content: Json
          created_at: string
          generated_by: string | null
          id: string
          mission_id: string
          moment_type: string
        }
        Insert: {
          active_date?: string
          content: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          mission_id: string
          moment_type: string
        }
        Update: {
          active_date?: string
          content?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          mission_id?: string
          moment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_mission_moments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json
          recipient_id: string | null
          recipient_role: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json
          recipient_id?: string | null
          recipient_role: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          recipient_id?: string | null
          recipient_role?: string
          type?: string
        }
        Relationships: []
      }
      atlas_playbook_chapters: {
        Row: {
          applicable_rfq_types: string[] | null
          chapter_code: string
          chapter_title: string
          common_mistakes: Json | null
          created_at: string | null
          example_language: Json | null
          id: string
          iris_summary: string | null
          is_active: boolean | null
          key_principles: Json | null
          knowledge_layer: string
          overview: string | null
          program_code: string | null
          related_chapters: string[] | null
          related_entities: string[] | null
          related_sources: string[] | null
          state_code: string | null
          updated_at: string | null
          version: number | null
          winning_patterns: Json | null
          writing_guidance: Json | null
        }
        Insert: {
          applicable_rfq_types?: string[] | null
          chapter_code: string
          chapter_title: string
          common_mistakes?: Json | null
          created_at?: string | null
          example_language?: Json | null
          id?: string
          iris_summary?: string | null
          is_active?: boolean | null
          key_principles?: Json | null
          knowledge_layer: string
          overview?: string | null
          program_code?: string | null
          related_chapters?: string[] | null
          related_entities?: string[] | null
          related_sources?: string[] | null
          state_code?: string | null
          updated_at?: string | null
          version?: number | null
          winning_patterns?: Json | null
          writing_guidance?: Json | null
        }
        Update: {
          applicable_rfq_types?: string[] | null
          chapter_code?: string
          chapter_title?: string
          common_mistakes?: Json | null
          created_at?: string | null
          example_language?: Json | null
          id?: string
          iris_summary?: string | null
          is_active?: boolean | null
          key_principles?: Json | null
          knowledge_layer?: string
          overview?: string | null
          program_code?: string | null
          related_chapters?: string[] | null
          related_entities?: string[] | null
          related_sources?: string[] | null
          state_code?: string | null
          updated_at?: string | null
          version?: number | null
          winning_patterns?: Json | null
          writing_guidance?: Json | null
        }
        Relationships: []
      }
      atlas_programs: {
        Row: {
          contract_term: string | null
          contract_value: string | null
          created_at: string | null
          current_contractor: string | null
          eligibility: string | null
          id: string
          iris_brief_updated_at: string | null
          iris_program_brief: string | null
          is_active: boolean | null
          last_procurement: string | null
          next_procurement: string | null
          operational_requirements: string | null
          population_served: string | null
          procurement_notes: string | null
          program_code: string
          program_name: string
          program_overview: string | null
          program_type: string | null
          proposal_implications: string | null
          quality_requirements: string | null
          reporting_requirements: string | null
          service_array: string | null
          state_code: string | null
          updated_at: string | null
        }
        Insert: {
          contract_term?: string | null
          contract_value?: string | null
          created_at?: string | null
          current_contractor?: string | null
          eligibility?: string | null
          id?: string
          iris_brief_updated_at?: string | null
          iris_program_brief?: string | null
          is_active?: boolean | null
          last_procurement?: string | null
          next_procurement?: string | null
          operational_requirements?: string | null
          population_served?: string | null
          procurement_notes?: string | null
          program_code: string
          program_name: string
          program_overview?: string | null
          program_type?: string | null
          proposal_implications?: string | null
          quality_requirements?: string | null
          reporting_requirements?: string | null
          service_array?: string | null
          state_code?: string | null
          updated_at?: string | null
        }
        Update: {
          contract_term?: string | null
          contract_value?: string | null
          created_at?: string | null
          current_contractor?: string | null
          eligibility?: string | null
          id?: string
          iris_brief_updated_at?: string | null
          iris_program_brief?: string | null
          is_active?: boolean | null
          last_procurement?: string | null
          next_procurement?: string | null
          operational_requirements?: string | null
          population_served?: string | null
          procurement_notes?: string | null
          program_code?: string
          program_name?: string
          program_overview?: string | null
          program_type?: string | null
          proposal_implications?: string | null
          quality_requirements?: string | null
          reporting_requirements?: string | null
          service_array?: string | null
          state_code?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_programs_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "atlas_states"
            referencedColumns: ["state_code"]
          },
        ]
      }
      atlas_shoutouts: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          message: string
          mission_id: string
          question_id: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          message: string
          mission_id: string
          question_id?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string
          mission_id?: string
          question_id?: string | null
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_shoutouts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_shoutouts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_source_citations: {
        Row: {
          created_at: string | null
          embedding: string | null
          id: string
          knowledge_layer: string | null
          page_ref: string | null
          program_code: string | null
          proposal_use_case: string | null
          quote_text: string
          section_ref: string | null
          source_id: string | null
          tags: string[] | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          knowledge_layer?: string | null
          page_ref?: string | null
          program_code?: string | null
          proposal_use_case?: string | null
          quote_text: string
          section_ref?: string | null
          source_id?: string | null
          tags?: string[] | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          id?: string
          knowledge_layer?: string | null
          page_ref?: string | null
          program_code?: string | null
          proposal_use_case?: string | null
          quote_text?: string
          section_ref?: string | null
          source_id?: string | null
          tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_source_citations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_source_definitions: {
        Row: {
          created_at: string | null
          definition: string
          id: string
          is_verbatim: boolean | null
          knowledge_layer: string | null
          program_code: string | null
          section_ref: string | null
          source_id: string | null
          term: string
        }
        Insert: {
          created_at?: string | null
          definition: string
          id?: string
          is_verbatim?: boolean | null
          knowledge_layer?: string | null
          program_code?: string | null
          section_ref?: string | null
          source_id?: string | null
          term: string
        }
        Update: {
          created_at?: string | null
          definition?: string
          id?: string
          is_verbatim?: boolean | null
          knowledge_layer?: string | null
          program_code?: string | null
          section_ref?: string | null
          source_id?: string | null
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_source_definitions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_source_monitor_log: {
        Row: {
          change_summary: string | null
          checked_at: string | null
          id: string
          requires_reingest: boolean | null
          source_id: string | null
          status: string | null
        }
        Insert: {
          change_summary?: string | null
          checked_at?: string | null
          id?: string
          requires_reingest?: boolean | null
          source_id?: string | null
          status?: string | null
        }
        Update: {
          change_summary?: string | null
          checked_at?: string | null
          id?: string
          requires_reingest?: boolean | null
          source_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_source_monitor_log_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_source_question_links: {
        Row: {
          connection_type: string | null
          created_at: string | null
          id: string
          linked_by: string | null
          question_id: string | null
          relevance_score: number | null
          source_id: string | null
        }
        Insert: {
          connection_type?: string | null
          created_at?: string | null
          id?: string
          linked_by?: string | null
          question_id?: string | null
          relevance_score?: number | null
          source_id?: string | null
        }
        Update: {
          connection_type?: string | null
          created_at?: string | null
          id?: string
          linked_by?: string | null
          question_id?: string | null
          relevance_score?: number | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_source_question_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_source_requirements: {
        Row: {
          created_at: string | null
          embedding: string | null
          entities_tagged: string[] | null
          id: string
          knowledge_layer: string | null
          program_code: string | null
          requirement: string
          requirement_type: string | null
          section_ref: string | null
          source_id: string | null
          state_code: string | null
          verbatim: string | null
        }
        Insert: {
          created_at?: string | null
          embedding?: string | null
          entities_tagged?: string[] | null
          id?: string
          knowledge_layer?: string | null
          program_code?: string | null
          requirement: string
          requirement_type?: string | null
          section_ref?: string | null
          source_id?: string | null
          state_code?: string | null
          verbatim?: string | null
        }
        Update: {
          created_at?: string | null
          embedding?: string | null
          entities_tagged?: string[] | null
          id?: string
          knowledge_layer?: string | null
          program_code?: string | null
          requirement?: string
          requirement_type?: string | null
          section_ref?: string | null
          source_id?: string | null
          state_code?: string | null
          verbatim?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_source_requirements_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_sources: {
        Row: {
          authority_score: number | null
          change_history: Json | null
          citation_ready_quotes: Json | null
          created_at: string | null
          date_last_checked: string | null
          date_last_ingested: string | null
          date_last_reviewed: string | null
          date_published: string | null
          embedding: string | null
          id: string
          ingested_by: string | null
          ingestion_confidence: string | null
          ingestion_notes: string | null
          issuing_authority: string | null
          key_definitions: Json | null
          key_requirements: Json | null
          knowledge_layer: string
          library_category: string | null
          mission_id: string | null
          needs_human_review: boolean | null
          program_code: string | null
          programs_applicable: string[] | null
          promoted_at: string | null
          promoted_by: string | null
          promoted_from_mission: string | null
          proposal_implications: Json | null
          related_concepts: string[] | null
          related_entities: string[] | null
          related_playbook_chapters: string[] | null
          related_rfp_questions: string[] | null
          review_reason: string | null
          source_file_id: string | null
          source_id: string
          source_raw_text: string | null
          source_title: string
          source_type: string | null
          source_url: string | null
          state_code: string | null
          states_applicable: string[] | null
          status: string | null
          summary: string | null
          tags: string[] | null
          topic_category: string | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          authority_score?: number | null
          change_history?: Json | null
          citation_ready_quotes?: Json | null
          created_at?: string | null
          date_last_checked?: string | null
          date_last_ingested?: string | null
          date_last_reviewed?: string | null
          date_published?: string | null
          embedding?: string | null
          id?: string
          ingested_by?: string | null
          ingestion_confidence?: string | null
          ingestion_notes?: string | null
          issuing_authority?: string | null
          key_definitions?: Json | null
          key_requirements?: Json | null
          knowledge_layer: string
          library_category?: string | null
          mission_id?: string | null
          needs_human_review?: boolean | null
          program_code?: string | null
          programs_applicable?: string[] | null
          promoted_at?: string | null
          promoted_by?: string | null
          promoted_from_mission?: string | null
          proposal_implications?: Json | null
          related_concepts?: string[] | null
          related_entities?: string[] | null
          related_playbook_chapters?: string[] | null
          related_rfp_questions?: string[] | null
          review_reason?: string | null
          source_file_id?: string | null
          source_id?: string
          source_raw_text?: string | null
          source_title: string
          source_type?: string | null
          source_url?: string | null
          state_code?: string | null
          states_applicable?: string[] | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          topic_category?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          authority_score?: number | null
          change_history?: Json | null
          citation_ready_quotes?: Json | null
          created_at?: string | null
          date_last_checked?: string | null
          date_last_ingested?: string | null
          date_last_reviewed?: string | null
          date_published?: string | null
          embedding?: string | null
          id?: string
          ingested_by?: string | null
          ingestion_confidence?: string | null
          ingestion_notes?: string | null
          issuing_authority?: string | null
          key_definitions?: Json | null
          key_requirements?: Json | null
          knowledge_layer?: string
          library_category?: string | null
          mission_id?: string | null
          needs_human_review?: boolean | null
          program_code?: string | null
          programs_applicable?: string[] | null
          promoted_at?: string | null
          promoted_by?: string | null
          promoted_from_mission?: string | null
          proposal_implications?: Json | null
          related_concepts?: string[] | null
          related_entities?: string[] | null
          related_playbook_chapters?: string[] | null
          related_rfp_questions?: string[] | null
          review_reason?: string | null
          source_file_id?: string | null
          source_id?: string
          source_raw_text?: string | null
          source_title?: string
          source_type?: string | null
          source_url?: string | null
          state_code?: string | null
          states_applicable?: string[] | null
          status?: string | null
          summary?: string | null
          tags?: string[] | null
          topic_category?: string | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_sources_program_code_fkey"
            columns: ["program_code"]
            isOneToOne: false
            referencedRelation: "atlas_programs"
            referencedColumns: ["program_code"]
          },
          {
            foreignKeyName: "atlas_sources_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "atlas_states"
            referencedColumns: ["state_code"]
          },
        ]
      }
      atlas_states: {
        Row: {
          agency_structure: string | null
          created_at: string | null
          id: string
          iris_brief_updated_at: string | null
          iris_state_brief: string | null
          is_active: boolean | null
          managed_care_model: string | null
          medicaid_authority: string | null
          political_environment: string | null
          procurement_history: string | null
          state_code: string
          state_name: string
          updated_at: string | null
        }
        Insert: {
          agency_structure?: string | null
          created_at?: string | null
          id?: string
          iris_brief_updated_at?: string | null
          iris_state_brief?: string | null
          is_active?: boolean | null
          managed_care_model?: string | null
          medicaid_authority?: string | null
          political_environment?: string | null
          procurement_history?: string | null
          state_code: string
          state_name: string
          updated_at?: string | null
        }
        Update: {
          agency_structure?: string | null
          created_at?: string | null
          id?: string
          iris_brief_updated_at?: string | null
          iris_state_brief?: string | null
          is_active?: boolean | null
          managed_care_model?: string | null
          medicaid_authority?: string | null
          political_environment?: string | null
          procurement_history?: string | null
          state_code?: string
          state_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      atlas_team_members: {
        Row: {
          address: string | null
          admin_notes: Json
          atlas_first_login_at: string | null
          atlas_hipaa_acknowledged: boolean
          atlas_hipaa_acknowledged_at: string | null
          atlas_hipaa_signature: string | null
          atlas_invite_sent_at: string | null
          atlas_invite_status: string
          atlas_last_active_at: string | null
          atlas_onboarding_complete: boolean
          atlas_profile_completeness: number
          atlas_resume_url: string | null
          atlas_role: string
          avatar_url: string | null
          clearance_status: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_removed: boolean
          job_title: string | null
          languages: string[] | null
          last_name: string | null
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          onboarding_step_completed: number
          phone: string | null
          removed_at: string | null
          removed_by: string | null
          skills: string[] | null
          talentdesk_date_joined: string | null
          talentdesk_id: string | null
          talentdesk_invited_by: string | null
          talentdesk_last_login: string | null
          talentdesk_status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_notes?: Json
          atlas_first_login_at?: string | null
          atlas_hipaa_acknowledged?: boolean
          atlas_hipaa_acknowledged_at?: string | null
          atlas_hipaa_signature?: string | null
          atlas_invite_sent_at?: string | null
          atlas_invite_status?: string
          atlas_last_active_at?: string | null
          atlas_onboarding_complete?: boolean
          atlas_profile_completeness?: number
          atlas_resume_url?: string | null
          atlas_role?: string
          avatar_url?: string | null
          clearance_status?: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          is_removed?: boolean
          job_title?: string | null
          languages?: string[] | null
          last_name?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_step_completed?: number
          phone?: string | null
          removed_at?: string | null
          removed_by?: string | null
          skills?: string[] | null
          talentdesk_date_joined?: string | null
          talentdesk_id?: string | null
          talentdesk_invited_by?: string | null
          talentdesk_last_login?: string | null
          talentdesk_status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_notes?: Json
          atlas_first_login_at?: string | null
          atlas_hipaa_acknowledged?: boolean
          atlas_hipaa_acknowledged_at?: string | null
          atlas_hipaa_signature?: string | null
          atlas_invite_sent_at?: string | null
          atlas_invite_status?: string
          atlas_last_active_at?: string | null
          atlas_onboarding_complete?: boolean
          atlas_profile_completeness?: number
          atlas_resume_url?: string | null
          atlas_role?: string
          avatar_url?: string | null
          clearance_status?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_removed?: boolean
          job_title?: string | null
          languages?: string[] | null
          last_name?: string | null
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_step_completed?: number
          phone?: string | null
          removed_at?: string | null
          removed_by?: string | null
          skills?: string[] | null
          talentdesk_date_joined?: string | null
          talentdesk_id?: string | null
          talentdesk_invited_by?: string | null
          talentdesk_last_login?: string | null
          talentdesk_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      atlas_team_sync_log: {
        Row: {
          conflicts: Json
          id: string
          records_added: number
          records_flagged: number
          records_updated: number
          synced_at: string
          synced_by: string | null
        }
        Insert: {
          conflicts?: Json
          id?: string
          records_added?: number
          records_flagged?: number
          records_updated?: number
          synced_at?: string
          synced_by?: string | null
        }
        Update: {
          conflicts?: Json
          id?: string
          records_added?: number
          records_flagged?: number
          records_updated?: number
          synced_at?: string
          synced_by?: string | null
        }
        Relationships: []
      }
      atlas_writer_block_sessions: {
        Row: {
          block_type: string
          created_at: string
          id: string
          iris_response: Json | null
          mission_id: string
          question_id: string | null
          user_id: string
          was_helpful: boolean | null
        }
        Insert: {
          block_type: string
          created_at?: string
          id?: string
          iris_response?: Json | null
          mission_id: string
          question_id?: string | null
          user_id: string
          was_helpful?: boolean | null
        }
        Update: {
          block_type?: string
          created_at?: string
          id?: string
          iris_response?: Json | null
          mission_id?: string
          question_id?: string | null
          user_id?: string
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_writer_block_sessions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_writer_block_sessions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_update_signals: {
        Row: {
          affected_sections: string[]
          created_at: string
          dismissed: boolean
          id: string
          intel_event_id: string | null
          mission_id: string | null
          reason: string | null
        }
        Insert: {
          affected_sections?: string[]
          created_at?: string
          dismissed?: boolean
          id?: string
          intel_event_id?: string | null
          mission_id?: string | null
          reason?: string | null
        }
        Update: {
          affected_sections?: string[]
          created_at?: string
          dismissed?: boolean
          id?: string
          intel_event_id?: string | null
          mission_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brief_update_signals_intel_event_id_fkey"
            columns: ["intel_event_id"]
            isOneToOne: false
            referencedRelation: "intel_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_update_signals_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_acknowledgments: {
        Row: {
          acknowledged_at: string
          briefing_id: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          briefing_id: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          briefing_id?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefing_acknowledgments_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
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
      briefings: {
        Row: {
          body: string
          created_at: string
          id: string
          is_deleted: boolean
          recipient_id: string | null
          sender_id: string
          sender_name: string
          sender_role: string | null
          sent_at: string
          subject: string
          type: Database["public"]["Enums"]["briefing_type"]
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          recipient_id?: string | null
          sender_id: string
          sender_name: string
          sender_role?: string | null
          sent_at?: string
          subject: string
          type: Database["public"]["Enums"]["briefing_type"]
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean
          recipient_id?: string | null
          sender_id?: string
          sender_name?: string
          sender_role?: string | null
          sent_at?: string
          subject?: string
          type?: Database["public"]["Enums"]["briefing_type"]
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
            foreignKeyName: "broadcasts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      canon_suggestions: {
        Row: {
          body: string
          category: string | null
          created_at: string
          debrief_id: string | null
          id: string
          mission_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          debrief_id?: string | null
          id?: string
          mission_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          debrief_id?: string | null
          id?: string
          mission_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canon_suggestions_debrief_id_fkey"
            columns: ["debrief_id"]
            isOneToOne: false
            referencedRelation: "mission_debriefs"
            referencedColumns: ["id"]
          },
        ]
      }
      change_requests: {
        Row: {
          admin_notes: string | null
          context: Json
          created_at: string
          id: string
          message: string
          mission_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          context?: Json
          created_at?: string
          id?: string
          message: string
          mission_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          surface: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          admin_notes?: string | null
          context?: Json
          created_at?: string
          id?: string
          message?: string
          mission_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_requests_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_cycles: {
        Row: {
          created_at: string
          cycle_start: string
          expires_at: string
          id: string
          mission_id: string
          trigger_type: string
        }
        Insert: {
          created_at?: string
          cycle_start: string
          expires_at: string
          id?: string
          mission_id: string
          trigger_type: string
        }
        Update: {
          created_at?: string
          cycle_start?: string
          expires_at?: string
          id?: string
          mission_id?: string
          trigger_type?: string
        }
        Relationships: []
      }
      checkin_section_updates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          progress_pct: number | null
          section_id: string
          source: string
          status: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          progress_pct?: number | null
          section_id: string
          source?: string
          status: string
          submission_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          progress_pct?: number | null
          section_id?: string
          source?: string
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_section_updates_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checkin_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_submissions: {
        Row: {
          cycle_id: string
          id: string
          mission_id: string
          submitted_at: string
          writer_user_id: string
        }
        Insert: {
          cycle_id: string
          id?: string
          mission_id: string
          submitted_at?: string
          writer_user_id: string
        }
        Update: {
          cycle_id?: string
          id?: string
          mission_id?: string
          submitted_at?: string
          writer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_submissions_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "checkin_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          cycle_id: string
          expires_at: string
          id: string
          mission_id: string
          token: string
          writer_user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          cycle_id: string
          expires_at: string
          id?: string
          mission_id: string
          token: string
          writer_user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          cycle_id?: string
          expires_at?: string
          id?: string
          mission_id?: string
          token?: string
          writer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_tokens_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "checkin_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_clarifications: {
        Row: {
          answered_at: string | null
          client_response: string | null
          created_at: string
          created_by: string | null
          id: string
          mission_id: string
          number: number
          question: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          answered_at?: string | null
          client_response?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id: string
          number: number
          question: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          answered_at?: string | null
          client_response?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id?: string
          number?: number
          question?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      collective_members: {
        Row: {
          created_at: string
          email: string | null
          external_id: string | null
          full_name: string
          id: string
          imported_at: string
          imported_by: string | null
          is_active: boolean
          location: string | null
          notes: string | null
          phone: string | null
          profile_id: string | null
          skill_tags: string[]
          source: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          full_name: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          is_active?: boolean
          location?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          skill_tags?: string[]
          source?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          external_id?: string | null
          full_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          is_active?: boolean
          location?: string | null
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          skill_tags?: string[]
          source?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collective_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collective_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      collective_memory: {
        Row: {
          detail: string | null
          evidence: Json
          id: string
          is_active: boolean
          kind: string
          outcome: string | null
          program_name: string | null
          promoted_at: string
          promoted_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score_delta: number | null
          source_mission_id: string | null
          source_mission_name: string | null
          state_code: string | null
          summary: string
          tags: string[]
        }
        Insert: {
          detail?: string | null
          evidence?: Json
          id?: string
          is_active?: boolean
          kind: string
          outcome?: string | null
          program_name?: string | null
          promoted_at?: string
          promoted_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_delta?: number | null
          source_mission_id?: string | null
          source_mission_name?: string | null
          state_code?: string | null
          summary: string
          tags?: string[]
        }
        Update: {
          detail?: string | null
          evidence?: Json
          id?: string
          is_active?: boolean
          kind?: string
          outcome?: string | null
          program_name?: string | null
          promoted_at?: string
          promoted_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_delta?: number | null
          source_mission_id?: string | null
          source_mission_name?: string | null
          state_code?: string | null
          summary?: string
          tags?: string[]
        }
        Relationships: []
      }
      comment_resolutions: {
        Row: {
          reopened_at: string | null
          reopened_by: string | null
          resolved_at: string
          resolved_by: string
          thread_id: string
        }
        Insert: {
          reopened_at?: string | null
          reopened_by?: string | null
          resolved_at?: string
          resolved_by: string
          thread_id: string
        }
        Update: {
          reopened_at?: string | null
          reopened_by?: string | null
          resolved_at?: string
          resolved_by?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_resolutions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          anchor_offset: number | null
          anchor_text: string | null
          author_id: string
          body: string
          created_at: string
          decision_note: string | null
          decision_starred_at: string | null
          decision_starred_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_decision: boolean
          is_deleted: boolean
          is_iris_reply: boolean
          thread_id: string
          version_tag: string | null
        }
        Insert: {
          anchor_offset?: number | null
          anchor_text?: string | null
          author_id: string
          body: string
          created_at?: string
          decision_note?: string | null
          decision_starred_at?: string | null
          decision_starred_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_decision?: boolean
          is_deleted?: boolean
          is_iris_reply?: boolean
          thread_id: string
          version_tag?: string | null
        }
        Update: {
          anchor_offset?: number | null
          anchor_text?: string | null
          author_id?: string
          body?: string
          created_at?: string
          decision_note?: string | null
          decision_starred_at?: string | null
          decision_starred_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_decision?: boolean
          is_deleted?: boolean
          is_iris_reply?: boolean
          thread_id?: string
          version_tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_profiles: {
        Row: {
          competitor_type: string
          contract_history: Json
          created_at: string
          differentiation_strategy: string | null
          executive_movements: Json
          graph_node_id: string | null
          id: string
          iris_confidence: string
          iris_sources: Json
          is_manually_added: boolean
          known_relationships: string | null
          known_strengths: string | null
          known_weaknesses: string | null
          likely_narrative: string | null
          mission_id: string
          organization_name: string
          protest_history: Json
          recent_intelligence: Json
          updated_at: string
          vulnerability_flags: Json
        }
        Insert: {
          competitor_type: string
          contract_history?: Json
          created_at?: string
          differentiation_strategy?: string | null
          executive_movements?: Json
          graph_node_id?: string | null
          id?: string
          iris_confidence?: string
          iris_sources?: Json
          is_manually_added?: boolean
          known_relationships?: string | null
          known_strengths?: string | null
          known_weaknesses?: string | null
          likely_narrative?: string | null
          mission_id: string
          organization_name: string
          protest_history?: Json
          recent_intelligence?: Json
          updated_at?: string
          vulnerability_flags?: Json
        }
        Update: {
          competitor_type?: string
          contract_history?: Json
          created_at?: string
          differentiation_strategy?: string | null
          executive_movements?: Json
          graph_node_id?: string | null
          id?: string
          iris_confidence?: string
          iris_sources?: Json
          is_manually_added?: boolean
          known_relationships?: string | null
          known_strengths?: string | null
          known_weaknesses?: string | null
          likely_narrative?: string | null
          mission_id?: string
          organization_name?: string
          protest_history?: Json
          recent_intelligence?: Json
          updated_at?: string
          vulnerability_flags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "competitor_profiles_graph_node_id_fkey"
            columns: ["graph_node_id"]
            isOneToOne: false
            referencedRelation: "intelligence_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_profiles_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_check_results: {
        Row: {
          checked_at: string
          evidence: string | null
          id: string
          iris_note: string | null
          mission_id: string
          question_id: string
          requirement_id: string | null
          requirement_snapshot: Json
          requirement_source: string
          score_me_run_id: string | null
          status: string
        }
        Insert: {
          checked_at?: string
          evidence?: string | null
          id?: string
          iris_note?: string | null
          mission_id: string
          question_id: string
          requirement_id?: string | null
          requirement_snapshot?: Json
          requirement_source?: string
          score_me_run_id?: string | null
          status?: string
        }
        Update: {
          checked_at?: string
          evidence?: string | null
          id?: string
          iris_note?: string | null
          mission_id?: string
          question_id?: string
          requirement_id?: string | null
          requirement_snapshot?: Json
          requirement_source?: string
          score_me_run_id?: string | null
          status?: string
        }
        Relationships: []
      }
      compliance_requirements: {
        Row: {
          created_at: string
          embedding: string | null
          extracted_at: string
          id: string
          is_federal: boolean
          last_verified: string | null
          mission_id: string
          plain_language: string | null
          relevant_question_ids: string[] | null
          requirement_text: string
          requirement_type: string | null
          section_reference: string | null
          severity: string
          source_document: string
          source_document_id: string | null
          source_kind: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          extracted_at?: string
          id?: string
          is_federal?: boolean
          last_verified?: string | null
          mission_id: string
          plain_language?: string | null
          relevant_question_ids?: string[] | null
          requirement_text: string
          requirement_type?: string | null
          section_reference?: string | null
          severity?: string
          source_document: string
          source_document_id?: string | null
          source_kind?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          extracted_at?: string
          id?: string
          is_federal?: boolean
          last_verified?: string | null
          mission_id?: string
          plain_language?: string | null
          relevant_question_ids?: string[] | null
          requirement_text?: string
          requirement_type?: string | null
          section_reference?: string | null
          severity?: string
          source_document?: string
          source_document_id?: string | null
          source_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      conflict_flags: {
        Row: {
          conflict_description: string
          created_at: string
          detected_from: string | null
          id: string
          mission_id: string
          question_id_a: string
          question_id_b: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          conflict_description: string
          created_at?: string
          detected_from?: string | null
          id?: string
          mission_id: string
          question_id_a: string
          question_id_b: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          conflict_description?: string
          created_at?: string
          detected_from?: string | null
          id?: string
          mission_id?: string
          question_id_a?: string
          question_id_b?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflict_flags_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_flags_question_id_a_fkey"
            columns: ["question_id_a"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflict_flags_question_id_b_fkey"
            columns: ["question_id_b"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          created_at: string
          event_type: string
          firm_id: string | null
          id: string
          idempotency_key: string
          mission_id: string | null
          occurred_at: string
          payload: Json
          source: string
          target_id: string | null
          target_table: string | null
          weight: number
          writer_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          firm_id?: string | null
          id?: string
          idempotency_key: string
          mission_id?: string | null
          occurred_at?: string
          payload?: Json
          source?: string
          target_id?: string | null
          target_table?: string | null
          weight?: number
          writer_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          firm_id?: string | null
          id?: string
          idempotency_key?: string
          mission_id?: string | null
          occurred_at?: string
          payload?: Json
          source?: string
          target_id?: string | null
          target_table?: string | null
          weight?: number
          writer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_intelligence_briefs: {
        Row: {
          at_risk_questions_count: number
          brief_date: string
          brief_type: string
          content: Json
          created_at: string
          delivered_at: string | null
          id: string
          is_delivered: boolean
          is_read: boolean
          key_intelligence_summary: string | null
          mission_id: string
          new_feed_items_count: number
          read_at: string | null
          recipient_id: string
          watch_questions_count: number
        }
        Insert: {
          at_risk_questions_count?: number
          brief_date: string
          brief_type: string
          content: Json
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean
          is_read?: boolean
          key_intelligence_summary?: string | null
          mission_id: string
          new_feed_items_count?: number
          read_at?: string | null
          recipient_id: string
          watch_questions_count?: number
        }
        Update: {
          at_risk_questions_count?: number
          brief_date?: string
          brief_type?: string
          content?: Json
          created_at?: string
          delivered_at?: string | null
          id?: string
          is_delivered?: boolean
          is_read?: boolean
          key_intelligence_summary?: string | null
          mission_id?: string
          new_feed_items_count?: number
          read_at?: string | null
          recipient_id?: string
          watch_questions_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_intelligence_briefs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_extractions: {
        Row: {
          created_at: string
          document_id: string
          error_message: string | null
          extracted_text: string | null
          id: string
          key_entities: string[]
          key_themes: string[]
          mission_id: string
          processed_at: string
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          key_entities?: string[]
          key_themes?: string[]
          mission_id: string
          processed_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          key_entities?: string[]
          key_themes?: string[]
          mission_id?: string
          processed_at?: string
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      draft_scores: {
        Row: {
          conciseness_explanation: string | null
          conciseness_score: number | null
          created_at: string
          draft_word_count: number | null
          evidence_explanation: string | null
          evidence_score: number | null
          gaps: Json
          id: string
          iris_recommendation: string | null
          mission_id: string
          overall_score: number
          question_id: string | null
          requirements_explanation: string | null
          requirements_score: number | null
          scoring_mode: string
          style_explanation: string | null
          style_score: number | null
          user_id: string
          win_theme_explanation: string | null
          win_theme_score: number | null
        }
        Insert: {
          conciseness_explanation?: string | null
          conciseness_score?: number | null
          created_at?: string
          draft_word_count?: number | null
          evidence_explanation?: string | null
          evidence_score?: number | null
          gaps?: Json
          id?: string
          iris_recommendation?: string | null
          mission_id: string
          overall_score: number
          question_id?: string | null
          requirements_explanation?: string | null
          requirements_score?: number | null
          scoring_mode?: string
          style_explanation?: string | null
          style_score?: number | null
          user_id: string
          win_theme_explanation?: string | null
          win_theme_score?: number | null
        }
        Update: {
          conciseness_explanation?: string | null
          conciseness_score?: number | null
          created_at?: string
          draft_word_count?: number | null
          evidence_explanation?: string | null
          evidence_score?: number | null
          gaps?: Json
          id?: string
          iris_recommendation?: string | null
          mission_id?: string
          overall_score?: number
          question_id?: string | null
          requirements_explanation?: string | null
          requirements_score?: number | null
          scoring_mode?: string
          style_explanation?: string | null
          style_score?: number | null
          user_id?: string
          win_theme_explanation?: string | null
          win_theme_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "draft_scores_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_scores_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
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
          scope: string
          source_id: string
          source_table: string
        }
        Insert: {
          content_text: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          mission_id?: string | null
          scope?: string
          source_id: string
          source_table: string
        }
        Update: {
          content_text?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          mission_id?: string | null
          scope?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      evaluator_pictures: {
        Row: {
          confidence_overall: string
          generated_at: string
          generated_by: string
          how_to_fill_gaps: Json
          id: string
          inferred_defensibility_needs: Json
          inferred_fears: Json
          inferred_panel_mindset: string | null
          inferred_pressures: Json
          mission_id: string
          named_individual_signals: Json
          one_sentence_bottom_line: string | null
          political_signals: Json
          prior_procurement_signals: Json
          public_record_signals: Json
          question_snapshots: Json
          rfp_signals: Json
          scoring_lens: string | null
          signals_count: number
          updated_at: string
          what_iris_does_not_know: string | null
        }
        Insert: {
          confidence_overall?: string
          generated_at?: string
          generated_by?: string
          how_to_fill_gaps?: Json
          id?: string
          inferred_defensibility_needs?: Json
          inferred_fears?: Json
          inferred_panel_mindset?: string | null
          inferred_pressures?: Json
          mission_id: string
          named_individual_signals?: Json
          one_sentence_bottom_line?: string | null
          political_signals?: Json
          prior_procurement_signals?: Json
          public_record_signals?: Json
          question_snapshots?: Json
          rfp_signals?: Json
          scoring_lens?: string | null
          signals_count?: number
          updated_at?: string
          what_iris_does_not_know?: string | null
        }
        Update: {
          confidence_overall?: string
          generated_at?: string
          generated_by?: string
          how_to_fill_gaps?: Json
          id?: string
          inferred_defensibility_needs?: Json
          inferred_fears?: Json
          inferred_panel_mindset?: string | null
          inferred_pressures?: Json
          mission_id?: string
          named_individual_signals?: Json
          one_sentence_bottom_line?: string | null
          political_signals?: Json
          prior_procurement_signals?: Json
          public_record_signals?: Json
          question_snapshots?: Json
          rfp_signals?: Json
          scoring_lens?: string | null
          signals_count?: number
          updated_at?: string
          what_iris_does_not_know?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluator_pictures_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_decisions: {
        Row: {
          created_at: string
          decision_note: string | null
          description: string
          id: string
          mission_id: string | null
          resolved_at: string | null
          source: Database["public"]["Enums"]["executive_decision_source"]
          status: Database["public"]["Enums"]["executive_decision_status"]
          submitted_by: string | null
          urgency: Database["public"]["Enums"]["executive_decision_urgency"]
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          description: string
          id?: string
          mission_id?: string | null
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["executive_decision_source"]
          status?: Database["public"]["Enums"]["executive_decision_status"]
          submitted_by?: string | null
          urgency?: Database["public"]["Enums"]["executive_decision_urgency"]
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          description?: string
          id?: string
          mission_id?: string | null
          resolved_at?: string | null
          source?: Database["public"]["Enums"]["executive_decision_source"]
          status?: Database["public"]["Enums"]["executive_decision_status"]
          submitted_by?: string | null
          urgency?: Database["public"]["Enums"]["executive_decision_urgency"]
        }
        Relationships: []
      }
      expert_consults: {
        Row: {
          ask_body: string
          ask_subject: string
          closed_at: string | null
          context_snapshot: Json
          created_at: string
          expert_user_id: string | null
          external_expert_id: string | null
          id: string
          mission_id: string
          question_id: string | null
          requested_by: string
          resolution_note: string | null
          response_at: string | null
          response_body: string | null
          section_id: string | null
          status: string
          updated_at: string
          urgency: string
        }
        Insert: {
          ask_body: string
          ask_subject: string
          closed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          expert_user_id?: string | null
          external_expert_id?: string | null
          id?: string
          mission_id: string
          question_id?: string | null
          requested_by: string
          resolution_note?: string | null
          response_at?: string | null
          response_body?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          ask_body?: string
          ask_subject?: string
          closed_at?: string | null
          context_snapshot?: Json
          created_at?: string
          expert_user_id?: string | null
          external_expert_id?: string | null
          id?: string
          mission_id?: string
          question_id?: string | null
          requested_by?: string
          resolution_note?: string | null
          response_at?: string | null
          response_body?: string | null
          section_id?: string | null
          status?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_consults_external_expert_id_fkey"
            columns: ["external_expert_id"]
            isOneToOne: false
            referencedRelation: "expert_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_directory: {
        Row: {
          active: boolean
          avg_response_hours: number | null
          created_at: string
          created_by: string | null
          domain_tags: string[]
          email: string | null
          id: string
          name: string
          notes: string | null
          org: string | null
          phone: string | null
          programs: string[]
          states: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avg_response_hours?: number | null
          created_at?: string
          created_by?: string | null
          domain_tags?: string[]
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org?: string | null
          phone?: string | null
          programs?: string[]
          states?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avg_response_hours?: number | null
          created_at?: string
          created_by?: string | null
          domain_tags?: string[]
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org?: string | null
          phone?: string | null
          programs?: string[]
          states?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expertise_library: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      expertise_queries: {
        Row: {
          created_at: string
          id: string
          iris_message: string | null
          matched_user_ids: string[]
          mission_id: string | null
          query_text: string
          question_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          iris_message?: string | null
          matched_user_ids?: string[]
          mission_id?: string | null
          query_text: string
          question_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          iris_message?: string | null
          matched_user_ids?: string[]
          mission_id?: string | null
          query_text?: string
          question_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expertise_queries_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expertise_queries_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      experts: {
        Row: {
          contact_method: string | null
          created_at: string
          expertise_areas: string[] | null
          focus_areas: string[] | null
          id: string
          key_insights: string[] | null
          mission_id: string | null
          name: string
          notes: string | null
          programs: string[] | null
          role: string | null
          source: string | null
          states: string[] | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          contact_method?: string | null
          created_at?: string
          expertise_areas?: string[] | null
          focus_areas?: string[] | null
          id?: string
          key_insights?: string[] | null
          mission_id?: string | null
          name: string
          notes?: string | null
          programs?: string[] | null
          role?: string | null
          source?: string | null
          states?: string[] | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          contact_method?: string | null
          created_at?: string
          expertise_areas?: string[] | null
          focus_areas?: string[] | null
          id?: string
          key_insights?: string[] | null
          mission_id?: string | null
          name?: string
          notes?: string | null
          programs?: string[] | null
          role?: string | null
          source?: string | null
          states?: string[] | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experts_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      federal_compliance_library: {
        Row: {
          citation: string
          created_at: string
          effective_date: string | null
          embedding: string | null
          id: string
          last_updated: string
          plain_language: string | null
          program_types: string[] | null
          regulation_name: string
          requirement_type: string | null
          section_text: string
          severity: string
        }
        Insert: {
          citation: string
          created_at?: string
          effective_date?: string | null
          embedding?: string | null
          id?: string
          last_updated?: string
          plain_language?: string | null
          program_types?: string[] | null
          regulation_name: string
          requirement_type?: string | null
          section_text: string
          severity?: string
        }
        Update: {
          citation?: string
          created_at?: string
          effective_date?: string | null
          embedding?: string | null
          id?: string
          last_updated?: string
          plain_language?: string | null
          program_types?: string[] | null
          regulation_name?: string
          requirement_type?: string | null
          section_text?: string
          severity?: string
        }
        Relationships: []
      }
      graph_edges: {
        Row: {
          confidence: number | null
          created_at: string
          dst_node_id: string
          edge_type: string
          id: string
          mission_id: string
          provenance: Json | null
          src_node_id: string
          valid_from: string
          valid_to: string | null
          weight: number
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          dst_node_id: string
          edge_type: string
          id?: string
          mission_id: string
          provenance?: Json | null
          src_node_id: string
          valid_from?: string
          valid_to?: string | null
          weight?: number
        }
        Update: {
          confidence?: number | null
          created_at?: string
          dst_node_id?: string
          edge_type?: string
          id?: string
          mission_id?: string
          provenance?: Json | null
          src_node_id?: string
          valid_from?: string
          valid_to?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_dst_node_id_fkey"
            columns: ["dst_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_src_node_id_fkey"
            columns: ["src_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          kind: string
          label: string
          metadata: Json | null
          mission_id: string
          ref_id: string | null
          ref_table: string | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          kind: string
          label: string
          metadata?: Json | null
          mission_id: string
          ref_id?: string | null
          ref_table?: string | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          kind?: string
          label?: string
          metadata?: Json | null
          mission_id?: string
          ref_id?: string | null
          ref_table?: string | null
          valid_from?: string
          valid_to?: string | null
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
      incident_response_plan: {
        Row: {
          classification: string
          evidence_preservation: string
          id: string
          immediate_response: string
          notification_obligations: string
          recovery_checklist: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          classification?: string
          evidence_preservation?: string
          id?: string
          immediate_response?: string
          notification_obligations?: string
          recovery_checklist?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          classification?: string
          evidence_preservation?: string
          id?: string
          immediate_response?: string
          notification_obligations?: string
          recovery_checklist?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          confidence: string | null
          content: string
          created_at: string
          expiry_flag: boolean | null
          id: string
          insight_type: string | null
          mission_id: string | null
          source: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          confidence?: string | null
          content: string
          created_at?: string
          expiry_flag?: boolean | null
          id?: string
          insight_type?: string | null
          mission_id?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          confidence?: string | null
          content?: string
          created_at?: string
          expiry_flag?: boolean | null
          id?: string
          insight_type?: string | null
          mission_id?: string | null
          source?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_entities: {
        Row: {
          created_at: string
          description: string | null
          entity_type: string
          id: string
          metadata: Json
          mission_ids: string[]
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          mission_ids?: string[]
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          mission_ids?: string[]
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      intel_events: {
        Row: {
          confidence: string | null
          confidence_score: number | null
          content: string
          created_at: string
          entity_refs: string[]
          event_type: string
          extracted_summary: string | null
          generated_by: string | null
          id: string
          iris_recommendation: string | null
          mission_id: string | null
          output_type: string | null
          population: string | null
          relevance_score: number | null
          routing_status: string | null
          signal_category: string | null
          significance: string | null
          source_entity_id: string | null
          source_id: string | null
          source_published_at: string | null
          source_title: string | null
          source_type: string | null
          source_url: string | null
          state: string | null
          tags: string[]
          title: string
        }
        Insert: {
          confidence?: string | null
          confidence_score?: number | null
          content: string
          created_at?: string
          entity_refs?: string[]
          event_type: string
          extracted_summary?: string | null
          generated_by?: string | null
          id?: string
          iris_recommendation?: string | null
          mission_id?: string | null
          output_type?: string | null
          population?: string | null
          relevance_score?: number | null
          routing_status?: string | null
          signal_category?: string | null
          significance?: string | null
          source_entity_id?: string | null
          source_id?: string | null
          source_published_at?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          state?: string | null
          tags?: string[]
          title: string
        }
        Update: {
          confidence?: string | null
          confidence_score?: number | null
          content?: string
          created_at?: string
          entity_refs?: string[]
          event_type?: string
          extracted_summary?: string | null
          generated_by?: string | null
          id?: string
          iris_recommendation?: string | null
          mission_id?: string | null
          output_type?: string | null
          population?: string | null
          relevance_score?: number | null
          routing_status?: string | null
          signal_category?: string | null
          significance?: string | null
          source_entity_id?: string | null
          source_id?: string | null
          source_published_at?: string | null
          source_title?: string | null
          source_type?: string | null
          source_url?: string | null
          state?: string | null
          tags?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_events_source_entity_id_fkey"
            columns: ["source_entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_events_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "intel_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_organizations: {
        Row: {
          contract_vehicles: string[] | null
          created_at: string
          entity_id: string | null
          id: string
          incumbency_status: string | null
          known_strengths: string[] | null
          known_weaknesses: string[] | null
          mission_id: string
          notes: string | null
          org_type: string
          parent_entity_id: string | null
        }
        Insert: {
          contract_vehicles?: string[] | null
          created_at?: string
          entity_id?: string | null
          id?: string
          incumbency_status?: string | null
          known_strengths?: string[] | null
          known_weaknesses?: string[] | null
          mission_id: string
          notes?: string | null
          org_type: string
          parent_entity_id?: string | null
        }
        Update: {
          contract_vehicles?: string[] | null
          created_at?: string
          entity_id?: string | null
          id?: string
          incumbency_status?: string | null
          known_strengths?: string[] | null
          known_weaknesses?: string[] | null
          mission_id?: string
          notes?: string | null
          org_type?: string
          parent_entity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_organizations_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_organizations_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_organizations_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_people: {
        Row: {
          created_at: string
          email: string | null
          entity_id: string | null
          id: string
          influence_level: string | null
          known_priorities: string[] | null
          mission_id: string
          name: string | null
          notes: string | null
          organization: string | null
          organization_entity_id: string | null
          phone: string | null
          relationship_stance: string | null
          role_type: string
          title: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          entity_id?: string | null
          id?: string
          influence_level?: string | null
          known_priorities?: string[] | null
          mission_id: string
          name?: string | null
          notes?: string | null
          organization?: string | null
          organization_entity_id?: string | null
          phone?: string | null
          relationship_stance?: string | null
          role_type: string
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          entity_id?: string | null
          id?: string
          influence_level?: string | null
          known_priorities?: string[] | null
          mission_id?: string
          name?: string | null
          notes?: string | null
          organization?: string | null
          organization_entity_id?: string | null
          phone?: string | null
          relationship_stance?: string | null
          role_type?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_people_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_people_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_people_organization_entity_id_fkey"
            columns: ["organization_entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_relationships: {
        Row: {
          co_occurrence_count: number | null
          confidence: string | null
          context: string | null
          created_at: string
          evidence_source_ids: string[] | null
          first_seen_at: string | null
          from_entity_id: string
          id: string
          last_seen_at: string | null
          mission_id: string | null
          relationship_context: string | null
          relationship_strength: number | null
          relationship_type: string
          to_entity_id: string
        }
        Insert: {
          co_occurrence_count?: number | null
          confidence?: string | null
          context?: string | null
          created_at?: string
          evidence_source_ids?: string[] | null
          first_seen_at?: string | null
          from_entity_id: string
          id?: string
          last_seen_at?: string | null
          mission_id?: string | null
          relationship_context?: string | null
          relationship_strength?: number | null
          relationship_type: string
          to_entity_id: string
        }
        Update: {
          co_occurrence_count?: number | null
          confidence?: string | null
          context?: string | null
          created_at?: string
          evidence_source_ids?: string[] | null
          first_seen_at?: string | null
          from_entity_id?: string
          id?: string
          last_seen_at?: string | null
          mission_id?: string | null
          relationship_context?: string | null
          relationship_strength?: number | null
          relationship_type?: string
          to_entity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intel_relationships_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_relationships_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_relationships_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_sources: {
        Row: {
          author: string | null
          created_at: string
          credibility_score: number | null
          entity_id: string | null
          file_path: string | null
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          last_content_hash: string | null
          last_monitored_at: string | null
          last_successful_check_at: string | null
          mission_id: string | null
          monitor_cadence: string | null
          monitor_daily: boolean | null
          notes: string | null
          published_at: string | null
          rss_url: string | null
          scrape_url: string | null
          seeded_at_setup: boolean | null
          signal_category: string | null
          source_category: string | null
          source_type: string
          summary: string | null
          tier: number | null
          url: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string
          credibility_score?: number | null
          entity_id?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_monitored_at?: string | null
          last_successful_check_at?: string | null
          mission_id?: string | null
          monitor_cadence?: string | null
          monitor_daily?: boolean | null
          notes?: string | null
          published_at?: string | null
          rss_url?: string | null
          scrape_url?: string | null
          seeded_at_setup?: boolean | null
          signal_category?: string | null
          source_category?: string | null
          source_type: string
          summary?: string | null
          tier?: number | null
          url?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string
          credibility_score?: number | null
          entity_id?: string | null
          file_path?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_monitored_at?: string | null
          last_successful_check_at?: string | null
          mission_id?: string | null
          monitor_cadence?: string | null
          monitor_daily?: boolean | null
          notes?: string | null
          published_at?: string | null
          rss_url?: string | null
          scrape_url?: string | null
          seeded_at_setup?: boolean | null
          signal_category?: string | null
          source_category?: string | null
          source_type?: string
          summary?: string | null
          tier?: number | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_sources_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "intel_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intel_sources_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_canon: {
        Row: {
          category: string
          citation: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          priority: number
          source_url: string | null
          tags: string[]
          topic: string
          updated_at: string
        }
        Insert: {
          category: string
          citation?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          source_url?: string | null
          tags?: string[]
          topic: string
          updated_at?: string
        }
        Update: {
          category?: string
          citation?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: number
          source_url?: string | null
          tags?: string[]
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      intelligence_feed_configs: {
        Row: {
          created_at: string
          feed_description: string | null
          feed_name: string
          feed_type: string
          feed_url: string | null
          id: string
          is_active: boolean
          is_preselected: boolean
          last_checked_at: string | null
          last_item_found_at: string | null
          mission_id: string
          monitoring_schedule: string
          preselection_reason: string | null
          total_items_found: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          feed_description?: string | null
          feed_name: string
          feed_type: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          is_preselected?: boolean
          last_checked_at?: string | null
          last_item_found_at?: string | null
          mission_id: string
          monitoring_schedule?: string
          preselection_reason?: string | null
          total_items_found?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          feed_description?: string | null
          feed_name?: string
          feed_type?: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          is_preselected?: boolean
          last_checked_at?: string | null
          last_item_found_at?: string | null
          mission_id?: string
          monitoring_schedule?: string
          preselection_reason?: string | null
          total_items_found?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_feed_configs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_feed_items: {
        Row: {
          affected_section_ids: string[]
          category: string
          created_at: string
          feed_config_id: string | null
          full_content: string | null
          headline: string
          id: string
          iris_assessment: string | null
          iris_relevance_score: number
          is_dismissed: boolean
          is_reviewed: boolean
          is_shared_with_team: boolean
          mission_id: string
          published_at: string | null
          recommended_action: string | null
          source_name: string | null
          source_url: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          affected_section_ids?: string[]
          category: string
          created_at?: string
          feed_config_id?: string | null
          full_content?: string | null
          headline: string
          id?: string
          iris_assessment?: string | null
          iris_relevance_score?: number
          is_dismissed?: boolean
          is_reviewed?: boolean
          is_shared_with_team?: boolean
          mission_id: string
          published_at?: string | null
          recommended_action?: string | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          affected_section_ids?: string[]
          category?: string
          created_at?: string
          feed_config_id?: string | null
          full_content?: string | null
          headline?: string
          id?: string
          iris_assessment?: string | null
          iris_relevance_score?: number
          is_dismissed?: boolean
          is_reviewed?: boolean
          is_shared_with_team?: boolean
          mission_id?: string
          published_at?: string | null
          recommended_action?: string | null
          source_name?: string | null
          source_url?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_feed_items_feed_config_id_fkey"
            columns: ["feed_config_id"]
            isOneToOne: false
            referencedRelation: "intelligence_feed_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_feed_items_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_graph_edges: {
        Row: {
          created_at: string
          id: string
          is_confirmed: boolean
          mission_id: string
          relationship_description: string | null
          relationship_type: string
          source_node_id: string
          strength: number
          target_node_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_confirmed?: boolean
          mission_id: string
          relationship_description?: string | null
          relationship_type: string
          source_node_id: string
          strength?: number
          target_node_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_confirmed?: boolean
          mission_id?: string
          relationship_description?: string | null
          relationship_type?: string
          source_node_id?: string
          strength?: number
          target_node_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_graph_edges_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "intelligence_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "intelligence_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_graph_nodes: {
        Row: {
          confidence_level: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          metadata: Json
          mission_id: string
          node_type: string
          source: string | null
          source_document_id: string | null
          source_feed_item_id: string | null
          updated_at: string
        }
        Insert: {
          confidence_level?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          metadata?: Json
          mission_id: string
          node_type: string
          source?: string | null
          source_document_id?: string | null
          source_feed_item_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence_level?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          metadata?: Json
          mission_id?: string
          node_type?: string
          source?: string | null
          source_document_id?: string | null
          source_feed_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_graph_nodes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_graph_nodes_source_feed_item_id_fkey"
            columns: ["source_feed_item_id"]
            isOneToOne: false
            referencedRelation: "intelligence_feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_loadout_history: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          mission_id: string
          performed_by: string
          performed_by_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id: string
          performed_by: string
          performed_by_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id?: string
          performed_by?: string
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_loadout_history_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_debriefs: {
        Row: {
          analyzed_at: string
          created_at: string
          gaps_remaining: Json | null
          id: string
          interview_flight_plan_id: string
          iris_analysis: Json | null
          recommended_followup: Json | null
          risk_signals: Json | null
          stories_extracted: Json | null
        }
        Insert: {
          analyzed_at?: string
          created_at?: string
          gaps_remaining?: Json | null
          id?: string
          interview_flight_plan_id: string
          iris_analysis?: Json | null
          recommended_followup?: Json | null
          risk_signals?: Json | null
          stories_extracted?: Json | null
        }
        Update: {
          analyzed_at?: string
          created_at?: string
          gaps_remaining?: Json | null
          id?: string
          interview_flight_plan_id?: string
          iris_analysis?: Json | null
          recommended_followup?: Json | null
          risk_signals?: Json | null
          stories_extracted?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_debriefs_interview_flight_plan_id_fkey"
            columns: ["interview_flight_plan_id"]
            isOneToOne: false
            referencedRelation: "interview_flight_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_flight_plans: {
        Row: {
          additional_context: string | null
          assigned_to: string | null
          completed_at: string | null
          content: Json | null
          created_at: string
          created_by: string | null
          generated_at: string | null
          id: string
          mission_id: string
          scheduled_at: string | null
          section_brief_id: string | null
          sme_name: string
          sme_organization: string | null
          sme_role: string
          sme_type: string
          status: string
          updated_at: string
        }
        Insert: {
          additional_context?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          mission_id: string
          scheduled_at?: string | null
          section_brief_id?: string | null
          sme_name: string
          sme_organization?: string | null
          sme_role: string
          sme_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          additional_context?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          generated_at?: string | null
          id?: string
          mission_id?: string
          scheduled_at?: string | null
          section_brief_id?: string | null
          sme_name?: string
          sme_organization?: string | null
          sme_role?: string
          sme_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_flight_plans_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_flight_plans_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_flight_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_flight_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_flight_plans_section_brief_id_fkey"
            columns: ["section_brief_id"]
            isOneToOne: false
            referencedRelation: "section_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_answers: {
        Row: {
          confidence_level: string | null
          context_snapshot: Json
          created_at: string
          created_by: string | null
          id: string
          mission_id: string
          prompt_type: string
          question_id: string | null
          response_full: Json
          sources_used: string[]
          updated_at: string
          user_correction: string | null
          user_rating: number | null
          was_helpful: boolean | null
        }
        Insert: {
          confidence_level?: string | null
          context_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id: string
          prompt_type: string
          question_id?: string | null
          response_full?: Json
          sources_used?: string[]
          updated_at?: string
          user_correction?: string | null
          user_rating?: number | null
          was_helpful?: boolean | null
        }
        Update: {
          confidence_level?: string | null
          context_snapshot?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id?: string
          prompt_type?: string
          question_id?: string | null
          response_full?: Json
          sources_used?: string[]
          updated_at?: string
          user_correction?: string | null
          user_rating?: number | null
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "iris_answers_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "iris_brief_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_corrections: {
        Row: {
          correct_text: string
          criticality: string
          flagged_at: string
          flagged_by: string | null
          id: string
          incorrect_text: string
          iris_content_block: string
          iris_content_type: string
          memory_id: string | null
          mission_id: string
          question_id: string | null
          resolved: boolean
          resolved_at: string | null
          scope: string
        }
        Insert: {
          correct_text: string
          criticality?: string
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          incorrect_text: string
          iris_content_block: string
          iris_content_type: string
          memory_id?: string | null
          mission_id: string
          question_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          scope?: string
        }
        Update: {
          correct_text?: string
          criticality?: string
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          incorrect_text?: string
          iris_content_block?: string
          iris_content_type?: string
          memory_id?: string | null
          mission_id?: string
          question_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          scope?: string
        }
        Relationships: []
      }
      iris_expertise_coverage: {
        Row: {
          calculated_at: string
          expertise_id: string
          id: string
          is_coverage_gap: boolean
          primary_users: number
          total_users: number
        }
        Insert: {
          calculated_at?: string
          expertise_id: string
          id?: string
          is_coverage_gap?: boolean
          primary_users?: number
          total_users?: number
        }
        Update: {
          calculated_at?: string
          expertise_id?: string
          id?: string
          is_coverage_gap?: boolean
          primary_users?: number
          total_users?: number
        }
        Relationships: [
          {
            foreignKeyName: "iris_expertise_coverage_expertise_id_fkey"
            columns: ["expertise_id"]
            isOneToOne: false
            referencedRelation: "expertise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_health_flags: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          mission_id: string
          question_id: string | null
          raised_at: string
          recommended_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          section_name: string | null
          severity: string
          status: string
          subject_writer_id: string | null
          title: string
          trigger_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          mission_id: string
          question_id?: string | null
          raised_at?: string
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_name?: string | null
          severity: string
          status?: string
          subject_writer_id?: string | null
          title: string
          trigger_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          mission_id?: string
          question_id?: string | null
          raised_at?: string
          recommended_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          section_name?: string | null
          severity?: string
          status?: string
          subject_writer_id?: string | null
          title?: string
          trigger_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      iris_memories: {
        Row: {
          archived_at: string | null
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          importance: string
          iris_reasoning: string | null
          last_used_at: string | null
          mission_id: string | null
          scope: string
          source: string | null
          summary: string | null
          superseded_at: string | null
          superseded_reason: string | null
          tags: string[]
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          archived_at?: string | null
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          importance?: string
          iris_reasoning?: string | null
          last_used_at?: string | null
          mission_id?: string | null
          scope?: string
          source?: string | null
          summary?: string | null
          superseded_at?: string | null
          superseded_reason?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          archived_at?: string | null
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          importance?: string
          iris_reasoning?: string | null
          last_used_at?: string | null
          mission_id?: string | null
          scope?: string
          source?: string | null
          summary?: string | null
          superseded_at?: string | null
          superseded_reason?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "iris_memories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_memories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_memory_usage: {
        Row: {
          context: string | null
          id: string
          memory_id: string
          mission_id: string | null
          question_id: string | null
          used_at: string
        }
        Insert: {
          context?: string | null
          id?: string
          memory_id: string
          mission_id?: string | null
          question_id?: string | null
          used_at?: string
        }
        Update: {
          context?: string | null
          id?: string
          memory_id?: string
          mission_id?: string | null
          question_id?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_memory_usage_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "iris_memories"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_onboarding_admin_resets: {
        Row: {
          id: string
          modules_reset: Json | null
          reason: string | null
          reset_at: string
          reset_by: string
          user_id: string
        }
        Insert: {
          id?: string
          modules_reset?: Json | null
          reason?: string | null
          reset_at?: string
          reset_by: string
          user_id: string
        }
        Update: {
          id?: string
          modules_reset?: Json | null
          reason?: string | null
          reset_at?: string
          reset_by?: string
          user_id?: string
        }
        Relationships: []
      }
      iris_onboarding_module_log: {
        Row: {
          cleared_at: string
          id: string
          module_number: number
          questions_asked: Json
          session_id: string
        }
        Insert: {
          cleared_at?: string
          id?: string
          module_number: number
          questions_asked?: Json
          session_id: string
        }
        Update: {
          cleared_at?: string
          id?: string
          module_number?: number
          questions_asked?: Json
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_onboarding_module_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "iris_onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_onboarding_sessions: {
        Row: {
          completed_at: string | null
          completion_hash: string | null
          id: string
          is_complete: boolean
          last_module: number
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completion_hash?: string | null
          id?: string
          is_complete?: boolean
          last_module?: number
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completion_hash?: string | null
          id?: string
          is_complete?: boolean
          last_module?: number
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      iris_portfolio_intelligence: {
        Row: {
          action_filter: string | null
          action_label: string | null
          affected_mission_ids: string[]
          body: string
          created_at: string
          dismissed_at: string | null
          generated_at: string
          headline: string
          id: string
          type: Database["public"]["Enums"]["iris_portfolio_intel_type"]
        }
        Insert: {
          action_filter?: string | null
          action_label?: string | null
          affected_mission_ids?: string[]
          body: string
          created_at?: string
          dismissed_at?: string | null
          generated_at?: string
          headline: string
          id?: string
          type: Database["public"]["Enums"]["iris_portfolio_intel_type"]
        }
        Update: {
          action_filter?: string | null
          action_label?: string | null
          affected_mission_ids?: string[]
          body?: string
          created_at?: string
          dismissed_at?: string | null
          generated_at?: string
          headline?: string
          id?: string
          type?: Database["public"]["Enums"]["iris_portfolio_intel_type"]
        }
        Relationships: []
      }
      iris_staffing_recommendations: {
        Row: {
          expertise_signals_used: string[]
          generated_at: string
          id: string
          match_score: number
          matched_expertise: string[]
          mission_id: string
          primary_match: boolean
          recommendation_reason: string | null
          user_id: string
        }
        Insert: {
          expertise_signals_used?: string[]
          generated_at?: string
          id?: string
          match_score?: number
          matched_expertise?: string[]
          mission_id: string
          primary_match?: boolean
          recommendation_reason?: string | null
          user_id: string
        }
        Update: {
          expertise_signals_used?: string[]
          generated_at?: string
          id?: string
          match_score?: number
          matched_expertise?: string[]
          mission_id?: string
          primary_match?: boolean
          recommendation_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_intelligence: {
        Row: {
          category: string | null
          created_at: string
          feed_type: string
          fetched_at: string
          id: string
          is_cross_referenced: boolean
          matched_mission_ids: string[] | null
          mission_id: string | null
          published_at: string | null
          question_ids: string[] | null
          source: string
          summary: string | null
          title: string
          type: string
          url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          feed_type?: string
          fetched_at?: string
          id?: string
          is_cross_referenced?: boolean
          matched_mission_ids?: string[] | null
          mission_id?: string | null
          published_at?: string | null
          question_ids?: string[] | null
          source: string
          summary?: string | null
          title: string
          type?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          feed_type?: string
          fetched_at?: string
          id?: string
          is_cross_referenced?: boolean
          matched_mission_ids?: string[] | null
          mission_id?: string | null
          published_at?: string | null
          question_ids?: string[] | null
          source?: string
          summary?: string | null
          title?: string
          type?: string
          url?: string | null
        }
        Relationships: []
      }
      mentions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          is_iris: boolean
          is_read: boolean
          mentioned_user: string | null
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          is_iris?: boolean
          is_read?: boolean
          mentioned_user?: string | null
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          is_iris?: boolean
          is_read?: boolean
          mentioned_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_changes: {
        Row: {
          change_reason: string | null
          change_source: string
          changed_at: string
          changed_by: string | null
          days_delta: number | null
          id: string
          milestone_id: string
          mission_id: string
          new_date: string
          previous_date: string
          source_document_id: string | null
        }
        Insert: {
          change_reason?: string | null
          change_source: string
          changed_at?: string
          changed_by?: string | null
          days_delta?: number | null
          id?: string
          milestone_id: string
          mission_id: string
          new_date: string
          previous_date: string
          source_document_id?: string | null
        }
        Update: {
          change_reason?: string | null
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          days_delta?: number | null
          id?: string
          milestone_id?: string
          mission_id?: string
          new_date?: string
          previous_date?: string
          source_document_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_changes_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "mission_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_changes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_assignment_smes: {
        Row: {
          added_at: string
          added_by: string | null
          assignment_id: string
          id: string
          sme_member_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          assignment_id: string
          id?: string
          sme_member_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          assignment_id?: string
          id?: string
          sme_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_assignment_smes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "mission_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_assignment_smes_sme_member_id_fkey"
            columns: ["sme_member_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_assignments: {
        Row: {
          acceptance_responded_at: string | null
          acceptance_status: string
          assigned_at: string
          assigned_by: string | null
          assigned_writer_id: string | null
          created_at: string
          due_date: string | null
          id: string
          mission_id: string
          question_id: string
          sme_member_ids: string[]
          updated_at: string
          writer_confidence: string
        }
        Insert: {
          acceptance_responded_at?: string | null
          acceptance_status?: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_writer_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          mission_id: string
          question_id: string
          sme_member_ids?: string[]
          updated_at?: string
          writer_confidence?: string
        }
        Update: {
          acceptance_responded_at?: string | null
          acceptance_status?: string
          assigned_at?: string
          assigned_by?: string | null
          assigned_writer_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          mission_id?: string
          question_id?: string
          sme_member_ids?: string[]
          updated_at?: string
          writer_confidence?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_assignments_assigned_writer_id_fkey"
            columns: ["assigned_writer_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_assignments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_assist_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          mission_id: string
          question_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          mission_id: string
          question_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          mission_id?: string
          question_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_assist_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_assist_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
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
      mission_audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          mission_id: string
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id?: string
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_audit_log_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_change_log: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string | null
          field_name: string | null
          id: string
          locked_in: boolean
          mission_id: string
          new_value: string | null
          old_value: string | null
          synced_to_atlas: boolean | null
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string | null
          field_name?: string | null
          id?: string
          locked_in?: boolean
          mission_id: string
          new_value?: string | null
          old_value?: string | null
          synced_to_atlas?: boolean | null
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string | null
          field_name?: string | null
          id?: string
          locked_in?: boolean
          mission_id?: string
          new_value?: string | null
          old_value?: string | null
          synced_to_atlas?: boolean | null
        }
        Relationships: []
      }
      mission_client_intel: {
        Row: {
          contacts: Json
          created_by_system: boolean
          decision_makers: Json
          last_advocate_scrub_at: string | null
          meeting_cadence: string | null
          mission_id: string
          notes: string | null
          political_considerations: string | null
          relationship_owners: Json
          stakeholders: Json
          updated_at: string
        }
        Insert: {
          contacts?: Json
          created_by_system?: boolean
          decision_makers?: Json
          last_advocate_scrub_at?: string | null
          meeting_cadence?: string | null
          mission_id: string
          notes?: string | null
          political_considerations?: string | null
          relationship_owners?: Json
          stakeholders?: Json
          updated_at?: string
        }
        Update: {
          contacts?: Json
          created_by_system?: boolean
          decision_makers?: Json
          last_advocate_scrub_at?: string | null
          meeting_cadence?: string | null
          mission_id?: string
          notes?: string | null
          political_considerations?: string | null
          relationship_owners?: Json
          stakeholders?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mission_client_intelligence: {
        Row: {
          added_by: string | null
          category: string
          content: string | null
          created_at: string
          date_of_intelligence: string | null
          id: string
          mission_id: string
          source_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          category: string
          content?: string | null
          created_at?: string
          date_of_intelligence?: string | null
          id?: string
          mission_id: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          category?: string
          content?: string | null
          created_at?: string
          date_of_intelligence?: string | null
          id?: string
          mission_id?: string
          source_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_client_intelligence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_compliance_requirements: {
        Row: {
          created_at: string
          id: string
          iris_extracted: boolean
          is_high_risk: boolean
          mission_id: string
          owner_id: string | null
          requirement: string
          section_id: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          iris_extracted?: boolean
          is_high_risk?: boolean
          mission_id: string
          owner_id?: string | null
          requirement: string
          section_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          iris_extracted?: boolean
          is_high_risk?: boolean
          mission_id?: string
          owner_id?: string | null
          requirement?: string
          section_id?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_compliance_requirements_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_compliance_requirements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_compliance_requirements_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "mission_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_conflict_ack: {
        Row: {
          acknowledged_by: string
          created_at: string
          id: string
          justification: string
          mission_a_id: string
          mission_b_id: string
        }
        Insert: {
          acknowledged_by: string
          created_at?: string
          id?: string
          justification: string
          mission_a_id: string
          mission_b_id: string
        }
        Update: {
          acknowledged_by?: string
          created_at?: string
          id?: string
          justification?: string
          mission_a_id?: string
          mission_b_id?: string
        }
        Relationships: []
      }
      mission_daily_focus: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          focus_date: string
          focus_text: string
          generated_by: string | null
          id: string
          iris_confidence: string | null
          mission_id: string
          priority_areas: string[] | null
          reason: string | null
          status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          focus_date?: string
          focus_text: string
          generated_by?: string | null
          id?: string
          iris_confidence?: string | null
          mission_id: string
          priority_areas?: string[] | null
          reason?: string | null
          status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          focus_date?: string
          focus_text?: string
          generated_by?: string | null
          id?: string
          iris_confidence?: string | null
          mission_id?: string
          priority_areas?: string[] | null
          reason?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_daily_focus_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_debriefs: {
        Row: {
          captured_by: string | null
          created_at: string
          evaluator_feedback: string | null
          id: string
          lessons_learned: string | null
          missed: string | null
          mission_id: string
          outcome: string
          scored_well: string | null
          updated_at: string
        }
        Insert: {
          captured_by?: string | null
          created_at?: string
          evaluator_feedback?: string | null
          id?: string
          lessons_learned?: string | null
          missed?: string | null
          mission_id: string
          outcome: string
          scored_well?: string | null
          updated_at?: string
        }
        Update: {
          captured_by?: string | null
          created_at?: string
          evaluator_feedback?: string | null
          id?: string
          lessons_learned?: string | null
          missed?: string | null
          mission_id?: string
          outcome?: string
          scored_well?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_decisions: {
        Row: {
          applies_to_programs: string[] | null
          applies_to_states: string[] | null
          category: string | null
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
          applies_to_programs?: string[] | null
          applies_to_states?: string[] | null
          category?: string | null
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
          applies_to_programs?: string[] | null
          applies_to_states?: string[] | null
          category?: string | null
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
        Relationships: []
      }
      mission_documents: {
        Row: {
          amendment_processed_at: string | null
          content_summary: string | null
          created_at: string
          document_purpose: string
          document_type: string
          file_url: string | null
          id: string
          is_amendment: boolean
          is_style_guide: boolean
          items_extracted: number
          metadata: Json
          mission_id: string
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          section_tags: string[]
          source_url: string | null
          style_guide_text: string | null
          title: string | null
          toc_data: Json | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          amendment_processed_at?: string | null
          content_summary?: string | null
          created_at?: string
          document_purpose?: string
          document_type: string
          file_url?: string | null
          id?: string
          is_amendment?: boolean
          is_style_guide?: boolean
          items_extracted?: number
          metadata?: Json
          mission_id: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          section_tags?: string[]
          source_url?: string | null
          style_guide_text?: string | null
          title?: string | null
          toc_data?: Json | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          amendment_processed_at?: string | null
          content_summary?: string | null
          created_at?: string
          document_purpose?: string
          document_type?: string
          file_url?: string | null
          id?: string
          is_amendment?: boolean
          is_style_guide?: boolean
          items_extracted?: number
          metadata?: Json
          mission_id?: string
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          section_tags?: string[]
          source_url?: string | null
          style_guide_text?: string | null
          title?: string | null
          toc_data?: Json | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_documents_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_ecosystem_nodes: {
        Row: {
          confidence: number
          coverage_pct: number
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_activity_at: string | null
          mission_id: string
          node_type: string
          signal_count: number
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number
          coverage_pct?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          last_activity_at?: string | null
          mission_id: string
          node_type: string
          signal_count?: number
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number
          coverage_pct?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          last_activity_at?: string | null
          mission_id?: string
          node_type?: string
          signal_count?: number
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_ecosystem_nodes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_evaluation_criteria: {
        Row: {
          category: string
          competitive_risk: string
          created_at: string
          display_order: number
          id: string
          mission_id: string
          notes: string | null
          points: number
          sections_covered: Json
          updated_at: string
        }
        Insert: {
          category: string
          competitive_risk?: string
          created_at?: string
          display_order?: number
          id?: string
          mission_id: string
          notes?: string | null
          points?: number
          sections_covered?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          competitive_risk?: string
          created_at?: string
          display_order?: number
          id?: string
          mission_id?: string
          notes?: string | null
          points?: number
          sections_covered?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mission_expertise_signals: {
        Row: {
          created_at: string
          expertise_id: string
          id: string
          mission_id: string
          source: string
          weight: number
        }
        Insert: {
          created_at?: string
          expertise_id: string
          id?: string
          mission_id: string
          source: string
          weight?: number
        }
        Update: {
          created_at?: string
          expertise_id?: string
          id?: string
          mission_id?: string
          source?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_expertise_signals_expertise_id_fkey"
            columns: ["expertise_id"]
            isOneToOne: false
            referencedRelation: "expertise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_financials: {
        Row: {
          budget: number | null
          consultants: Json
          hours: number | null
          mission_id: string
          sow: string | null
          tracking: Json
          updated_at: string
        }
        Insert: {
          budget?: number | null
          consultants?: Json
          hours?: number | null
          mission_id: string
          sow?: string | null
          tracking?: Json
          updated_at?: string
        }
        Update: {
          budget?: number | null
          consultants?: Json
          hours?: number | null
          mission_id?: string
          sow?: string | null
          tracking?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mission_governance: {
        Row: {
          approval_workflow: Json
          escalation_path: Json
          leadership_gates: Json
          mission_id: string
          quality_gates: Json
          submission_authority: string | null
          updated_at: string
        }
        Insert: {
          approval_workflow?: Json
          escalation_path?: Json
          leadership_gates?: Json
          mission_id: string
          quality_gates?: Json
          submission_authority?: string | null
          updated_at?: string
        }
        Update: {
          approval_workflow?: Json
          escalation_path?: Json
          leadership_gates?: Json
          mission_id?: string
          quality_gates?: Json
          submission_authority?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_health_overrides: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          mission_id: string
          new_state: string
          overridden_by: string
          previous_state: string | null
          question_id: string
          reason: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          mission_id: string
          new_state: string
          overridden_by: string
          previous_state?: string | null
          question_id: string
          reason: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          mission_id?: string
          new_state?: string
          overridden_by?: string
          previous_state?: string | null
          question_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_health_overrides_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_health_overrides_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_intelligence: {
        Row: {
          content: Json
          created_at: string
          generated_at: string
          id: string
          iris_notes: string | null
          layer: string
          mission_id: string
          source_document_ids: string[]
          updated_at: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          generated_at?: string
          id?: string
          iris_notes?: string | null
          layer: string
          mission_id: string
          source_document_ids?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          generated_at?: string
          id?: string
          iris_notes?: string | null
          layer?: string
          mission_id?: string
          source_document_ids?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      mission_intelligence_dna: {
        Row: {
          dna: Json
          dna_version: number
          generated_at: string
          generated_by: string | null
          generated_from: string | null
          id: string
          is_current: boolean
          mission_id: string
        }
        Insert: {
          dna: Json
          dna_version?: number
          generated_at?: string
          generated_by?: string | null
          generated_from?: string | null
          id?: string
          is_current?: boolean
          mission_id: string
        }
        Update: {
          dna?: Json
          dna_version?: number
          generated_at?: string
          generated_by?: string | null
          generated_from?: string | null
          id?: string
          is_current?: boolean
          mission_id?: string
        }
        Relationships: []
      }
      mission_intelligence_health: {
        Row: {
          competitive_visibility_pct: number
          created_at: string
          id: string
          iris_status: string
          last_scan_at: string | null
          last_signal_at: string | null
          mission_id: string
          overall_confidence: number
          policy_visibility_pct: number
          source_coverage_pct: number
          stakeholder_visibility_pct: number
          updated_at: string
        }
        Insert: {
          competitive_visibility_pct?: number
          created_at?: string
          id?: string
          iris_status?: string
          last_scan_at?: string | null
          last_signal_at?: string | null
          mission_id: string
          overall_confidence?: number
          policy_visibility_pct?: number
          source_coverage_pct?: number
          stakeholder_visibility_pct?: number
          updated_at?: string
        }
        Update: {
          competitive_visibility_pct?: number
          created_at?: string
          id?: string
          iris_status?: string
          last_scan_at?: string | null
          last_signal_at?: string | null
          mission_id?: string
          overall_confidence?: number
          policy_visibility_pct?: number
          source_coverage_pct?: number
          stakeholder_visibility_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_intelligence_health_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
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
      mission_iris_extractions: {
        Row: {
          confidence_score: number | null
          confirmed_at: string | null
          confirmed_by_user: boolean
          created_at: string
          extracted_field: string
          extracted_value: string | null
          id: string
          mission_id: string
          overridden_by_user: boolean
          source_file_id: string | null
          source_file_name: string | null
          updated_at: string
          user_override_value: string | null
          wizard_step: number | null
        }
        Insert: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          extracted_field: string
          extracted_value?: string | null
          id?: string
          mission_id: string
          overridden_by_user?: boolean
          source_file_id?: string | null
          source_file_name?: string | null
          updated_at?: string
          user_override_value?: string | null
          wizard_step?: number | null
        }
        Update: {
          confidence_score?: number | null
          confirmed_at?: string | null
          confirmed_by_user?: boolean
          created_at?: string
          extracted_field?: string
          extracted_value?: string | null
          id?: string
          mission_id?: string
          overridden_by_user?: boolean
          source_file_id?: string | null
          source_file_name?: string | null
          updated_at?: string
          user_override_value?: string | null
          wizard_step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_iris_extractions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_journey_deliverables: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          mission_id: string
          order_index: number
          owner_member_id: string | null
          phase_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          mission_id: string
          order_index?: number
          owner_member_id?: string | null
          phase_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          mission_id?: string
          order_index?: number
          owner_member_id?: string | null
          phase_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_journey_deliverables_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_journey_deliverables_owner_member_id_fkey"
            columns: ["owner_member_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_journey_deliverables_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "mission_journey_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_journey_phases: {
        Row: {
          cleared_at: string | null
          cleared_by: string | null
          color: string | null
          created_at: string
          end_date: string | null
          id: string
          is_cleared: boolean
          is_locked: boolean
          kind: string
          mission_id: string
          name: string
          notes: string | null
          order_index: number
          start_date: string | null
          updated_at: string
        }
        Insert: {
          cleared_at?: string | null
          cleared_by?: string | null
          color?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_cleared?: boolean
          is_locked?: boolean
          kind?: string
          mission_id: string
          name: string
          notes?: string | null
          order_index?: number
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          cleared_at?: string | null
          cleared_by?: string | null
          color?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_cleared?: boolean
          is_locked?: boolean
          kind?: string
          mission_id?: string
          name?: string
          notes?: string | null
          order_index?: number
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_journey_phases_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_launch_briefs: {
        Row: {
          brief_text: string
          created_at: string | null
          generated_by: string | null
          id: string
          mission_id: string | null
        }
        Insert: {
          brief_text: string
          created_at?: string | null
          generated_by?: string | null
          id?: string
          mission_id?: string | null
        }
        Update: {
          brief_text?: string
          created_at?: string | null
          generated_by?: string | null
          id?: string
          mission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_launch_briefs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_manager_flags: {
        Row: {
          created_at: string
          flag_reason: string | null
          flagged_by: string
          id: string
          mission_id: string
          question_id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          flag_reason?: string | null
          flagged_by: string
          id?: string
          mission_id: string
          question_id: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          flag_reason?: string | null
          flagged_by?: string
          id?: string
          mission_id?: string
          question_id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_manager_flags_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_manager_flags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_member_expertise: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
      mission_milestones: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          is_external: boolean
          is_hard_deadline: boolean
          is_pens_down: boolean
          milestone_date: string
          milestone_time: string | null
          milestone_type: string
          mission_id: string
          notes: string | null
          owner_id: string | null
          source: string | null
          source_document_id: string | null
          status: string | null
          timezone: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_external?: boolean
          is_hard_deadline?: boolean
          is_pens_down?: boolean
          milestone_date: string
          milestone_time?: string | null
          milestone_type: string
          mission_id: string
          notes?: string | null
          owner_id?: string | null
          source?: string | null
          source_document_id?: string | null
          status?: string | null
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_external?: boolean
          is_hard_deadline?: boolean
          is_pens_down?: boolean
          milestone_date?: string
          milestone_time?: string | null
          milestone_type?: string
          mission_id?: string
          notes?: string | null
          owner_id?: string | null
          source?: string | null
          source_document_id?: string | null
          status?: string | null
          timezone?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_milestones_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mm_source_doc_fk"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "mission_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_momentum_daily: {
        Row: {
          activity_score: number | null
          composite_score: number | null
          created_at: string
          id: string
          mission_id: string
          oracle_score: number | null
          pace_score: number | null
          risk_score: number | null
          score_date: string
        }
        Insert: {
          activity_score?: number | null
          composite_score?: number | null
          created_at?: string
          id?: string
          mission_id: string
          oracle_score?: number | null
          pace_score?: number | null
          risk_score?: number | null
          score_date?: string
        }
        Update: {
          activity_score?: number | null
          composite_score?: number | null
          created_at?: string
          id?: string
          mission_id?: string
          oracle_score?: number | null
          pace_score?: number | null
          risk_score?: number | null
          score_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_momentum_daily_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_monitoring_sources: {
        Row: {
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          label: string
          last_checked_at: string | null
          last_content_hash: string | null
          last_signal_at: string | null
          mission_id: string
          source_type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          label: string
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_signal_at?: string | null
          mission_id: string
          source_type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          label?: string
          last_checked_at?: string | null
          last_content_hash?: string | null
          last_signal_at?: string | null
          mission_id?: string
          source_type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      mission_north_star: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string | null
          id: string
          iris_suggested: boolean | null
          mission_id: string
          notes: string | null
          status: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string | null
          id?: string
          iris_suggested?: boolean | null
          mission_id: string
          notes?: string | null
          status?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string | null
          id?: string
          iris_suggested?: boolean | null
          mission_id?: string
          notes?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_north_star_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_nudges: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          mission_id: string
          recipient_id: string
          sender_id: string
          sent_at: string
          status: string
        }
        Insert: {
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          mission_id: string
          recipient_id: string
          sender_id: string
          sent_at?: string
          status?: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          mission_id?: string
          recipient_id?: string
          sender_id?: string
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_nudges_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_outcomes: {
        Row: {
          award_date: string | null
          award_value: number | null
          awarded_to: string | null
          awarded_value_usd: number | null
          bafo_notes: string | null
          bafo_requested: boolean | null
          created_at: string
          debrief_notes: string | null
          debrief_received: boolean | null
          decided_at: string
          final_rank: number | null
          final_score_received: number | null
          incumbent_retained: boolean | null
          mission_id: string
          notes: string | null
          orals_held: boolean | null
          orals_notes: string | null
          outcome: string
          population_impacted: number | null
          recorded_at: string
          recorded_by: string | null
          total_offerors: number | null
          transition_start_date: string | null
          updated_at: string
        }
        Insert: {
          award_date?: string | null
          award_value?: number | null
          awarded_to?: string | null
          awarded_value_usd?: number | null
          bafo_notes?: string | null
          bafo_requested?: boolean | null
          created_at?: string
          debrief_notes?: string | null
          debrief_received?: boolean | null
          decided_at?: string
          final_rank?: number | null
          final_score_received?: number | null
          incumbent_retained?: boolean | null
          mission_id: string
          notes?: string | null
          orals_held?: boolean | null
          orals_notes?: string | null
          outcome: string
          population_impacted?: number | null
          recorded_at?: string
          recorded_by?: string | null
          total_offerors?: number | null
          transition_start_date?: string | null
          updated_at?: string
        }
        Update: {
          award_date?: string | null
          award_value?: number | null
          awarded_to?: string | null
          awarded_value_usd?: number | null
          bafo_notes?: string | null
          bafo_requested?: boolean | null
          created_at?: string
          debrief_notes?: string | null
          debrief_received?: boolean | null
          decided_at?: string
          final_rank?: number | null
          final_score_received?: number | null
          incumbent_retained?: boolean | null
          mission_id?: string
          notes?: string | null
          orals_held?: boolean | null
          orals_notes?: string | null
          outcome?: string
          population_impacted?: number | null
          recorded_at?: string
          recorded_by?: string | null
          total_offerors?: number | null
          transition_start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_proof_points: {
        Row: {
          created_at: string
          graph_node_id: string | null
          id: string
          iris_confidence: number | null
          iris_sources: Json | null
          is_manually_added: boolean
          mission_id: string
          signal_authority: string | null
          source: string | null
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          graph_node_id?: string | null
          id?: string
          iris_confidence?: number | null
          iris_sources?: Json | null
          is_manually_added?: boolean
          mission_id: string
          signal_authority?: string | null
          source?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          graph_node_id?: string | null
          id?: string
          iris_confidence?: number | null
          iris_sources?: Json | null
          is_manually_added?: boolean
          mission_id?: string
          signal_authority?: string | null
          source?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_proof_points_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_pulse_log: {
        Row: {
          blockers: string | null
          created_at: string
          id: string
          mission_id: string | null
          pulse_date: string | null
          sentiment: string | null
          submitted_by: string | null
          update_text: string | null
        }
        Insert: {
          blockers?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          pulse_date?: string | null
          sentiment?: string | null
          submitted_by?: string | null
          update_text?: string | null
        }
        Update: {
          blockers?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          pulse_date?: string | null
          sentiment?: string | null
          submitted_by?: string | null
          update_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_pulse_log_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_pulse_updates: {
        Row: {
          affected_question_ids: string[]
          created_at: string
          domain: string
          id: string
          mission_id: string
          notes: string | null
          triggered_brief_refresh: boolean
          updated_by: string
        }
        Insert: {
          affected_question_ids?: string[]
          created_at?: string
          domain: string
          id?: string
          mission_id: string
          notes?: string | null
          triggered_brief_refresh?: boolean
          updated_by: string
        }
        Update: {
          affected_question_ids?: string[]
          created_at?: string
          domain?: string
          id?: string
          mission_id?: string
          notes?: string | null
          triggered_brief_refresh?: boolean
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_pulse_updates_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_qa_log: {
        Row: {
          answer: string | null
          answer_received_at: string | null
          category: string | null
          created_at: string
          date_issued: string | null
          id: string
          impact_level: string
          iris_interpretation: string | null
          mission_id: string
          qa_number: string | null
          question: string
          question_submitted_at: string | null
          question_submitted_by: string | null
          sections_affected: string[]
          state_response: string | null
          status: string
          updated_at: string
        }
        Insert: {
          answer?: string | null
          answer_received_at?: string | null
          category?: string | null
          created_at?: string
          date_issued?: string | null
          id?: string
          impact_level?: string
          iris_interpretation?: string | null
          mission_id: string
          qa_number?: string | null
          question: string
          question_submitted_at?: string | null
          question_submitted_by?: string | null
          sections_affected?: string[]
          state_response?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          answer?: string | null
          answer_received_at?: string | null
          category?: string | null
          created_at?: string
          date_issued?: string | null
          id?: string
          impact_level?: string
          iris_interpretation?: string | null
          mission_id?: string
          qa_number?: string | null
          question?: string
          question_submitted_at?: string | null
          question_submitted_by?: string | null
          sections_affected?: string[]
          state_response?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_qa_log_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_questions: {
        Row: {
          brief_notes: string | null
          created_at: string
          due_date: string | null
          evaluation_criteria: string | null
          evaluation_weight: number | null
          evaluator_fear: string | null
          exhibit_description: string | null
          health_calculated_at: string | null
          health_status: string
          id: string
          iris_brief: Json | null
          iris_brief_generated_at: string | null
          iris_brief_status: string
          iris_confidence: string | null
          iris_decoded_intent: string | null
          iris_evidence: Json | null
          iris_extracted: boolean | null
          iris_extracted_at: string | null
          iris_intel_note: string | null
          is_inferred: boolean
          is_withdrawn: boolean
          mission_id: string
          narrative_role: string | null
          page_limit: number | null
          point_value: number | null
          primary_win_theme: string | null
          question_number: string | null
          question_text: string | null
          relevant_feed_item_ids: Json
          requires_exhibit: boolean
          reviewed_by_admin: boolean
          secondary_win_theme: string | null
          section_id: string | null
          status: string
          story_mapped_at: string | null
          updated_at: string
          word_limit: number | null
        }
        Insert: {
          brief_notes?: string | null
          created_at?: string
          due_date?: string | null
          evaluation_criteria?: string | null
          evaluation_weight?: number | null
          evaluator_fear?: string | null
          exhibit_description?: string | null
          health_calculated_at?: string | null
          health_status?: string
          id?: string
          iris_brief?: Json | null
          iris_brief_generated_at?: string | null
          iris_brief_status?: string
          iris_confidence?: string | null
          iris_decoded_intent?: string | null
          iris_evidence?: Json | null
          iris_extracted?: boolean | null
          iris_extracted_at?: string | null
          iris_intel_note?: string | null
          is_inferred?: boolean
          is_withdrawn?: boolean
          mission_id: string
          narrative_role?: string | null
          page_limit?: number | null
          point_value?: number | null
          primary_win_theme?: string | null
          question_number?: string | null
          question_text?: string | null
          relevant_feed_item_ids?: Json
          requires_exhibit?: boolean
          reviewed_by_admin?: boolean
          secondary_win_theme?: string | null
          section_id?: string | null
          status?: string
          story_mapped_at?: string | null
          updated_at?: string
          word_limit?: number | null
        }
        Update: {
          brief_notes?: string | null
          created_at?: string
          due_date?: string | null
          evaluation_criteria?: string | null
          evaluation_weight?: number | null
          evaluator_fear?: string | null
          exhibit_description?: string | null
          health_calculated_at?: string | null
          health_status?: string
          id?: string
          iris_brief?: Json | null
          iris_brief_generated_at?: string | null
          iris_brief_status?: string
          iris_confidence?: string | null
          iris_decoded_intent?: string | null
          iris_evidence?: Json | null
          iris_extracted?: boolean | null
          iris_extracted_at?: string | null
          iris_intel_note?: string | null
          is_inferred?: boolean
          is_withdrawn?: boolean
          mission_id?: string
          narrative_role?: string | null
          page_limit?: number | null
          point_value?: number | null
          primary_win_theme?: string | null
          question_number?: string | null
          question_text?: string | null
          relevant_feed_item_ids?: Json
          requires_exhibit?: boolean
          reviewed_by_admin?: boolean
          secondary_win_theme?: string | null
          section_id?: string | null
          status?: string
          story_mapped_at?: string | null
          updated_at?: string
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_questions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "mission_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_readiness: {
        Row: {
          assignments_reviewed: boolean | null
          client_access_requested: boolean | null
          contracts_complete: boolean | null
          created_at: string | null
          folders_created: boolean | null
          id: string
          kickoff_materials_ready: boolean | null
          mission_id: string
          required_forms_complete: boolean | null
          reviewed_at: string | null
          security_acknowledgments_complete: boolean | null
          slack_channels_ready: boolean | null
          talentdesk_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          assignments_reviewed?: boolean | null
          client_access_requested?: boolean | null
          contracts_complete?: boolean | null
          created_at?: string | null
          folders_created?: boolean | null
          id?: string
          kickoff_materials_ready?: boolean | null
          mission_id: string
          required_forms_complete?: boolean | null
          reviewed_at?: string | null
          security_acknowledgments_complete?: boolean | null
          slack_channels_ready?: boolean | null
          talentdesk_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assignments_reviewed?: boolean | null
          client_access_requested?: boolean | null
          contracts_complete?: boolean | null
          created_at?: string | null
          folders_created?: boolean | null
          id?: string
          kickoff_materials_ready?: boolean | null
          mission_id?: string
          required_forms_complete?: boolean | null
          reviewed_at?: string | null
          security_acknowledgments_complete?: boolean | null
          slack_channels_ready?: boolean | null
          talentdesk_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      mission_response_template_elements: {
        Row: {
          created_at: string
          element_type: Database["public"]["Enums"]["response_template_element_type"]
          id: string
          label: string
          order_index: number
          parent_id: string | null
          table_columns: Json | null
          template_id: string
          updated_at: string
          word_limit: number | null
        }
        Insert: {
          created_at?: string
          element_type: Database["public"]["Enums"]["response_template_element_type"]
          id?: string
          label: string
          order_index?: number
          parent_id?: string | null
          table_columns?: Json | null
          template_id: string
          updated_at?: string
          word_limit?: number | null
        }
        Update: {
          created_at?: string
          element_type?: Database["public"]["Enums"]["response_template_element_type"]
          id?: string
          label?: string
          order_index?: number
          parent_id?: string | null
          table_columns?: Json | null
          template_id?: string
          updated_at?: string
          word_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_response_template_elements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mission_response_template_elements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_response_template_elements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mission_response_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_response_template_versions: {
        Row: {
          created_at: string
          id: string
          saved_by: string | null
          snapshot: Json
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          saved_by?: string | null
          snapshot: Json
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          saved_by?: string | null
          snapshot?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_response_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "mission_response_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_response_templates: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          iris_confidence: string | null
          iris_source_citation: string | null
          mission_id: string
          source: Database["public"]["Enums"]["response_template_source"] | null
          source_file_name: string | null
          source_file_path: string | null
          status: Database["public"]["Enums"]["response_template_status"]
          updated_at: string
          version: number
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          iris_confidence?: string | null
          iris_source_citation?: string | null
          mission_id: string
          source?:
            | Database["public"]["Enums"]["response_template_source"]
            | null
          source_file_name?: string | null
          source_file_path?: string | null
          status?: Database["public"]["Enums"]["response_template_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          iris_confidence?: string | null
          iris_source_citation?: string | null
          mission_id?: string
          source?:
            | Database["public"]["Enums"]["response_template_source"]
            | null
          source_file_name?: string | null
          source_file_path?: string | null
          status?: Database["public"]["Enums"]["response_template_status"]
          updated_at?: string
          version?: number
        }
        Relationships: []
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
        Relationships: []
      }
      mission_risks: {
        Row: {
          created_at: string | null
          created_by_system: boolean
          description: string | null
          historical_note: string | null
          id: string
          mission_id: string
          owner: string | null
          question_id: string | null
          severity: string | null
          status: string | null
          times_seen_historically: number | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by_system?: boolean
          description?: string | null
          historical_note?: string | null
          id?: string
          mission_id: string
          owner?: string | null
          question_id?: string | null
          severity?: string | null
          status?: string | null
          times_seen_historically?: number | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by_system?: boolean
          description?: string | null
          historical_note?: string | null
          id?: string
          mission_id?: string
          owner?: string | null
          question_id?: string | null
          severity?: string | null
          status?: string | null
          times_seen_historically?: number | null
          title?: string
        }
        Relationships: []
      }
      mission_section_template_progress: {
        Row: {
          content: string
          created_at: string
          element_id: string
          id: string
          is_complete: boolean
          section_id: string
          updated_at: string
          updated_by: string | null
          word_count: number
        }
        Insert: {
          content?: string
          created_at?: string
          element_id: string
          id?: string
          is_complete?: boolean
          section_id: string
          updated_at?: string
          updated_by?: string | null
          word_count?: number
        }
        Update: {
          content?: string
          created_at?: string
          element_id?: string
          id?: string
          is_complete?: boolean
          section_id?: string
          updated_at?: string
          updated_by?: string | null
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "mission_section_template_progress_element_id_fkey"
            columns: ["element_id"]
            isOneToOne: false
            referencedRelation: "mission_response_template_elements"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_sections: {
        Row: {
          amendment_flagged: boolean
          central_claim_reflected: boolean | null
          coherence_notes: string | null
          coherence_reviewed_at: string | null
          coherence_reviewed_by: string | null
          coherence_status: string | null
          created_at: string
          description: string | null
          evaluation_weight: number | null
          id: string
          iris_confidence: string | null
          is_form_only: boolean
          mission_id: string
          name: string | null
          order_index: number | null
          page_limit: number | null
          parent_section_id: string | null
          reviewed_by_admin: boolean
          section_number: string | null
          updated_at: string
          volume_id: string | null
        }
        Insert: {
          amendment_flagged?: boolean
          central_claim_reflected?: boolean | null
          coherence_notes?: string | null
          coherence_reviewed_at?: string | null
          coherence_reviewed_by?: string | null
          coherence_status?: string | null
          created_at?: string
          description?: string | null
          evaluation_weight?: number | null
          id?: string
          iris_confidence?: string | null
          is_form_only?: boolean
          mission_id: string
          name?: string | null
          order_index?: number | null
          page_limit?: number | null
          parent_section_id?: string | null
          reviewed_by_admin?: boolean
          section_number?: string | null
          updated_at?: string
          volume_id?: string | null
        }
        Update: {
          amendment_flagged?: boolean
          central_claim_reflected?: boolean | null
          coherence_notes?: string | null
          coherence_reviewed_at?: string | null
          coherence_reviewed_by?: string | null
          coherence_status?: string | null
          created_at?: string
          description?: string | null
          evaluation_weight?: number | null
          id?: string
          iris_confidence?: string | null
          is_form_only?: boolean
          mission_id?: string
          name?: string | null
          order_index?: number | null
          page_limit?: number | null
          parent_section_id?: string | null
          reviewed_by_admin?: boolean
          section_number?: string | null
          updated_at?: string
          volume_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_sections_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sections_parent_section_id_fkey"
            columns: ["parent_section_id"]
            isOneToOne: false
            referencedRelation: "mission_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_sections_volume_id_fkey"
            columns: ["volume_id"]
            isOneToOne: false
            referencedRelation: "mission_volumes"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_sensitivities: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          mission_id: string
          note: string
          severity: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id: string
          note: string
          severity?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id?: string
          note?: string
          severity?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_staffing_summary: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          high_risk_areas: Json
          id: string
          mission_id: string
          overloaded_writers: Json
          sections_without_owner: Json
          totals: Json
          unassigned_questions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          high_risk_areas?: Json
          id?: string
          mission_id: string
          overloaded_writers?: Json
          sections_without_owner?: Json
          totals?: Json
          unassigned_questions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          high_risk_areas?: Json
          id?: string
          mission_id?: string
          overloaded_writers?: Json
          sections_without_owner?: Json
          totals?: Json
          unassigned_questions?: Json
          updated_at?: string
        }
        Relationships: []
      }
      mission_strategy: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_system: boolean
          id: string
          kind: string
          label: string
          mission_id: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_system?: boolean
          id?: string
          kind: string
          label: string
          mission_id: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_system?: boolean
          id?: string
          kind?: string
          label?: string
          mission_id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      mission_style_guide: {
        Row: {
          banned_phrases: string | null
          competitive_sensitivities: string | null
          created_at: string
          cultural_sensitivities: string | null
          formatting_requirements: string | null
          formatting_rules: string | null
          grammar_rules: string | null
          historical_sensitivities: string | null
          id: string
          length_and_density: string | null
          mission_id: string
          political_sensitivities: string | null
          required_phrases: string | null
          sensitivities: string | null
          terminology: string | null
          terminology_preferences: Json
          tone: string | null
          updated_at: string
          voice: string | null
          voice_and_tone: string | null
          words_to_avoid: Json
        }
        Insert: {
          banned_phrases?: string | null
          competitive_sensitivities?: string | null
          created_at?: string
          cultural_sensitivities?: string | null
          formatting_requirements?: string | null
          formatting_rules?: string | null
          grammar_rules?: string | null
          historical_sensitivities?: string | null
          id?: string
          length_and_density?: string | null
          mission_id: string
          political_sensitivities?: string | null
          required_phrases?: string | null
          sensitivities?: string | null
          terminology?: string | null
          terminology_preferences?: Json
          tone?: string | null
          updated_at?: string
          voice?: string | null
          voice_and_tone?: string | null
          words_to_avoid?: Json
        }
        Update: {
          banned_phrases?: string | null
          competitive_sensitivities?: string | null
          created_at?: string
          cultural_sensitivities?: string | null
          formatting_requirements?: string | null
          formatting_rules?: string | null
          grammar_rules?: string | null
          historical_sensitivities?: string | null
          id?: string
          length_and_density?: string | null
          mission_id?: string
          political_sensitivities?: string | null
          required_phrases?: string | null
          sensitivities?: string | null
          terminology?: string | null
          terminology_preferences?: Json
          tone?: string | null
          updated_at?: string
          voice?: string | null
          voice_and_tone?: string | null
          words_to_avoid?: Json
        }
        Relationships: [
          {
            foreignKeyName: "mission_style_guide_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_submission_checklist: {
        Row: {
          category: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          iris_extracted: boolean
          is_complete: boolean
          label: string
          mission_id: string
          order_index: number
          owner_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          iris_extracted?: boolean
          is_complete?: boolean
          label: string
          mission_id: string
          order_index?: number
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          iris_extracted?: boolean
          is_complete?: boolean
          label?: string
          mission_id?: string
          order_index?: number
          owner_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_submission_checklist_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_team_members: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          member_id: string
          mission_id: string
          mission_role: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          member_id: string
          mission_id: string
          mission_role?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          member_id?: string
          mission_id?: string
          mission_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "atlas_team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_team_members_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_timeline: {
        Row: {
          award: string | null
          draft_deadlines: Json
          exec_review: string | null
          gold_team: string | null
          mission_id: string
          orals: string | null
          pink_team: string | null
          question_deadline: string | null
          red_team: string | null
          submission: string | null
          updated_at: string
        }
        Insert: {
          award?: string | null
          draft_deadlines?: Json
          exec_review?: string | null
          gold_team?: string | null
          mission_id: string
          orals?: string | null
          pink_team?: string | null
          question_deadline?: string | null
          red_team?: string | null
          submission?: string | null
          updated_at?: string
        }
        Update: {
          award?: string | null
          draft_deadlines?: Json
          exec_review?: string | null
          gold_team?: string | null
          mission_id?: string
          orals?: string | null
          pink_team?: string | null
          question_deadline?: string | null
          red_team?: string | null
          submission?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mission_vault_documents: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          doc_type: Database["public"]["Enums"]["vault_doc_type"]
          external_url: string | null
          extracted_at: string | null
          extracted_requirements: Json | null
          extracted_terms: string[] | null
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string | null
          file_path: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          mission_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
          version: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          doc_type: Database["public"]["Enums"]["vault_doc_type"]
          external_url?: string | null
          extracted_at?: string | null
          extracted_requirements?: Json | null
          extracted_terms?: string[] | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          mission_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          doc_type?: Database["public"]["Enums"]["vault_doc_type"]
          external_url?: string | null
          extracted_at?: string | null
          extracted_requirements?: Json | null
          extracted_terms?: string[] | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          mission_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version?: string | null
        }
        Relationships: []
      }
      mission_volumes: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          name: string | null
          order_index: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          name?: string | null
          order_index?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          name?: string | null
          order_index?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_volumes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_win_strategy: {
        Row: {
          admin_confirmed_at: string | null
          admin_confirmed_by: string | null
          central_claim: string | null
          central_claim_confirmed_at: string | null
          central_claim_confirmed_by: string | null
          client_priorities: string | null
          client_priorities_confirmed_at: string | null
          client_priorities_confirmed_by: string | null
          competitor_analysis: string | null
          competitor_analysis_confirmed_at: string | null
          competitor_analysis_confirmed_by: string | null
          confirmed_fields: Json
          created_at: string
          discriminators: string | null
          discriminators_confirmed_at: string | null
          discriminators_confirmed_by: string | null
          evaluator_hot_buttons: string | null
          evaluator_priorities: string | null
          executive_summary: string | null
          executive_summary_confirmed_at: string | null
          executive_summary_confirmed_by: string | null
          id: string
          iris_drafted_at: string | null
          known_competitors: Json
          known_risks: string | null
          mission_id: string
          mission_significance: string | null
          north_star_confirmed_at: string | null
          north_star_confirmed_by: string | null
          north_star_message: string | null
          proof_points: Json
          proof_points_confirmed_at: string | null
          proof_points_confirmed_by: string | null
          risk_mitigation: string | null
          risk_mitigation_confirmed_at: string | null
          risk_mitigation_confirmed_by: string | null
          updated_at: string
          value_proposition: string | null
          value_proposition_confirmed_at: string | null
          value_proposition_confirmed_by: string | null
          win_themes: Json
          win_themes_confirmed_at: string | null
          win_themes_confirmed_by: string | null
        }
        Insert: {
          admin_confirmed_at?: string | null
          admin_confirmed_by?: string | null
          central_claim?: string | null
          central_claim_confirmed_at?: string | null
          central_claim_confirmed_by?: string | null
          client_priorities?: string | null
          client_priorities_confirmed_at?: string | null
          client_priorities_confirmed_by?: string | null
          competitor_analysis?: string | null
          competitor_analysis_confirmed_at?: string | null
          competitor_analysis_confirmed_by?: string | null
          confirmed_fields?: Json
          created_at?: string
          discriminators?: string | null
          discriminators_confirmed_at?: string | null
          discriminators_confirmed_by?: string | null
          evaluator_hot_buttons?: string | null
          evaluator_priorities?: string | null
          executive_summary?: string | null
          executive_summary_confirmed_at?: string | null
          executive_summary_confirmed_by?: string | null
          id?: string
          iris_drafted_at?: string | null
          known_competitors?: Json
          known_risks?: string | null
          mission_id: string
          mission_significance?: string | null
          north_star_confirmed_at?: string | null
          north_star_confirmed_by?: string | null
          north_star_message?: string | null
          proof_points?: Json
          proof_points_confirmed_at?: string | null
          proof_points_confirmed_by?: string | null
          risk_mitigation?: string | null
          risk_mitigation_confirmed_at?: string | null
          risk_mitigation_confirmed_by?: string | null
          updated_at?: string
          value_proposition?: string | null
          value_proposition_confirmed_at?: string | null
          value_proposition_confirmed_by?: string | null
          win_themes?: Json
          win_themes_confirmed_at?: string | null
          win_themes_confirmed_by?: string | null
        }
        Update: {
          admin_confirmed_at?: string | null
          admin_confirmed_by?: string | null
          central_claim?: string | null
          central_claim_confirmed_at?: string | null
          central_claim_confirmed_by?: string | null
          client_priorities?: string | null
          client_priorities_confirmed_at?: string | null
          client_priorities_confirmed_by?: string | null
          competitor_analysis?: string | null
          competitor_analysis_confirmed_at?: string | null
          competitor_analysis_confirmed_by?: string | null
          confirmed_fields?: Json
          created_at?: string
          discriminators?: string | null
          discriminators_confirmed_at?: string | null
          discriminators_confirmed_by?: string | null
          evaluator_hot_buttons?: string | null
          evaluator_priorities?: string | null
          executive_summary?: string | null
          executive_summary_confirmed_at?: string | null
          executive_summary_confirmed_by?: string | null
          id?: string
          iris_drafted_at?: string | null
          known_competitors?: Json
          known_risks?: string | null
          mission_id?: string
          mission_significance?: string | null
          north_star_confirmed_at?: string | null
          north_star_confirmed_by?: string | null
          north_star_message?: string | null
          proof_points?: Json
          proof_points_confirmed_at?: string | null
          proof_points_confirmed_by?: string | null
          risk_mitigation?: string | null
          risk_mitigation_confirmed_at?: string | null
          risk_mitigation_confirmed_by?: string | null
          updated_at?: string
          value_proposition?: string | null
          value_proposition_confirmed_at?: string | null
          value_proposition_confirmed_by?: string | null
          win_themes?: Json
          win_themes_confirmed_at?: string | null
          win_themes_confirmed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_win_strategy_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_win_themes: {
        Row: {
          alignment_score: number | null
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          mission_id: string
          proof_points: string[] | null
          related_intel_ids: string[] | null
          status: string | null
          title: string
          updated_at: string | null
          watch_outs: string[] | null
          what_theyre_buying: string | null
          why_it_matters: string | null
        }
        Insert: {
          alignment_score?: number | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          mission_id: string
          proof_points?: string[] | null
          related_intel_ids?: string[] | null
          status?: string | null
          title: string
          updated_at?: string | null
          watch_outs?: string[] | null
          what_theyre_buying?: string | null
          why_it_matters?: string | null
        }
        Update: {
          alignment_score?: number | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          mission_id?: string
          proof_points?: string[] | null
          related_intel_ids?: string[] | null
          status?: string | null
          title?: string
          updated_at?: string | null
          watch_outs?: string[] | null
          what_theyre_buying?: string | null
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_win_themes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          agency_code: string | null
          agency_name: string | null
          avoid: string[] | null
          biggest_concerns: string | null
          blast_off_at: string | null
          blast_off_by: string | null
          brief_approved_at: string | null
          brief_approved_by: string | null
          brief_status: string
          brief_version: number
          client_name: string | null
          contract_value: number | null
          created_at: string
          created_by: string | null
          debrief_completed: boolean
          executive_intelligence: Json | null
          health_score: number | null
          how_we_win: string | null
          id: string
          intel_coverage_score: number | null
          intelligence_graph_completeness: number
          intelligence_loadout_step: number
          iris_disclaimer: string | null
          iris_extraction_note: string | null
          iris_extraction_status: string | null
          known_competitors: string[] | null
          leadership_broadcast: string | null
          leadership_broadcast_author: string | null
          metadata: Json
          mission_journey: string | null
          monitoring_schedule: string
          name: string
          north_star: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          prime_contractor: string | null
          procurement_evolution_analysis: string | null
          procurement_type: string | null
          program_type: string | null
          reinforce: string[] | null
          slack_webhook_url: string | null
          stakeholder_intelligence: Json | null
          state: string | null
          state_code: string | null
          state_priorities: string | null
          status: string
          submission_deadline: string
          team_readiness_score: number | null
          teams_webhook_url: string | null
          today_focus: string | null
          updated_at: string
          watch_items: string | null
          why_it_matters: string | null
          why_lose: string | null
          why_win: string | null
          win_themes_text: string | null
          writing_signals: Json | null
        }
        Insert: {
          agency_code?: string | null
          agency_name?: string | null
          avoid?: string[] | null
          biggest_concerns?: string | null
          blast_off_at?: string | null
          blast_off_by?: string | null
          brief_approved_at?: string | null
          brief_approved_by?: string | null
          brief_status?: string
          brief_version?: number
          client_name?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          debrief_completed?: boolean
          executive_intelligence?: Json | null
          health_score?: number | null
          how_we_win?: string | null
          id?: string
          intel_coverage_score?: number | null
          intelligence_graph_completeness?: number
          intelligence_loadout_step?: number
          iris_disclaimer?: string | null
          iris_extraction_note?: string | null
          iris_extraction_status?: string | null
          known_competitors?: string[] | null
          leadership_broadcast?: string | null
          leadership_broadcast_author?: string | null
          metadata?: Json
          mission_journey?: string | null
          monitoring_schedule?: string
          name: string
          north_star?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          prime_contractor?: string | null
          procurement_evolution_analysis?: string | null
          procurement_type?: string | null
          program_type?: string | null
          reinforce?: string[] | null
          slack_webhook_url?: string | null
          stakeholder_intelligence?: Json | null
          state?: string | null
          state_code?: string | null
          state_priorities?: string | null
          status?: string
          submission_deadline: string
          team_readiness_score?: number | null
          teams_webhook_url?: string | null
          today_focus?: string | null
          updated_at?: string
          watch_items?: string | null
          why_it_matters?: string | null
          why_lose?: string | null
          why_win?: string | null
          win_themes_text?: string | null
          writing_signals?: Json | null
        }
        Update: {
          agency_code?: string | null
          agency_name?: string | null
          avoid?: string[] | null
          biggest_concerns?: string | null
          blast_off_at?: string | null
          blast_off_by?: string | null
          brief_approved_at?: string | null
          brief_approved_by?: string | null
          brief_status?: string
          brief_version?: number
          client_name?: string | null
          contract_value?: number | null
          created_at?: string
          created_by?: string | null
          debrief_completed?: boolean
          executive_intelligence?: Json | null
          health_score?: number | null
          how_we_win?: string | null
          id?: string
          intel_coverage_score?: number | null
          intelligence_graph_completeness?: number
          intelligence_loadout_step?: number
          iris_disclaimer?: string | null
          iris_extraction_note?: string | null
          iris_extraction_status?: string | null
          known_competitors?: string[] | null
          leadership_broadcast?: string | null
          leadership_broadcast_author?: string | null
          metadata?: Json
          mission_journey?: string | null
          monitoring_schedule?: string
          name?: string
          north_star?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          prime_contractor?: string | null
          procurement_evolution_analysis?: string | null
          procurement_type?: string | null
          program_type?: string | null
          reinforce?: string[] | null
          slack_webhook_url?: string | null
          stakeholder_intelligence?: Json | null
          state?: string | null
          state_code?: string | null
          state_priorities?: string | null
          status?: string
          submission_deadline?: string
          team_readiness_score?: number | null
          teams_webhook_url?: string | null
          today_focus?: string | null
          updated_at?: string
          watch_items?: string | null
          why_it_matters?: string | null
          why_lose?: string | null
          why_win?: string | null
          win_themes_text?: string | null
          writing_signals?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "missions_brief_approved_by_fkey"
            columns: ["brief_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_brief_approved_by_fkey"
            columns: ["brief_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_scores: {
        Row: {
          created_at: string
          evaluator_note: string | null
          id: string
          mission_id: string
          question_id: string | null
          recorded_by: string
          score: number
          scored_at: string
          section_name: string | null
          stage: string
          threshold_critical: number
          threshold_green: number
          threshold_yellow: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          evaluator_note?: string | null
          id?: string
          mission_id: string
          question_id?: string | null
          recorded_by: string
          score: number
          scored_at?: string
          section_name?: string | null
          stage: string
          threshold_critical?: number
          threshold_green?: number
          threshold_yellow?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          evaluator_note?: string | null
          id?: string
          mission_id?: string
          question_id?: string | null
          recorded_by?: string
          score?: number
          scored_at?: string
          section_name?: string | null
          stage?: string
          threshold_critical?: number
          threshold_green?: number
          threshold_yellow?: number
          updated_at?: string
        }
        Relationships: []
      }
      note_reads: {
        Row: {
          id: string
          mission_id: string
          note_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          id?: string
          mission_id: string
          note_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          id?: string
          mission_id?: string
          note_id?: string
          seen_at?: string
          user_id?: string
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
      oracle_beliefs: {
        Row: {
          belief_text: string
          belief_type: string
          confidence: number
          created_at: string
          id: string
          mission_id: string
          status: string
          updated_at: string
        }
        Insert: {
          belief_text: string
          belief_type: string
          confidence?: number
          created_at?: string
          id?: string
          mission_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          belief_text?: string
          belief_type?: string
          confidence?: number
          created_at?: string
          id?: string
          mission_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_beliefs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_decision_intelligence: {
        Row: {
          client_name: string | null
          competitor_dynamics: string | null
          confidence_score: number | null
          created_at: string | null
          created_by: string | null
          decision_summary: string | null
          decision_type: string | null
          evaluator_priorities: string | null
          id: string
          key_influencers: string | null
          lessons_for_future_missions: string | null
          mission_id: string | null
          outcome: string | null
          procurement_name: string | null
          reusable_oracle_memory: string | null
          risks_that_mattered: string | null
          signals_that_preceded_it: string | null
          source_reference: string | null
          source_type: string | null
          stakeholder_dynamics: string | null
          state: string | null
          updated_at: string | null
          why_it_happened: string | null
          win_themes_that_failed: string | null
          win_themes_that_landed: string | null
        }
        Insert: {
          client_name?: string | null
          competitor_dynamics?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          decision_summary?: string | null
          decision_type?: string | null
          evaluator_priorities?: string | null
          id?: string
          key_influencers?: string | null
          lessons_for_future_missions?: string | null
          mission_id?: string | null
          outcome?: string | null
          procurement_name?: string | null
          reusable_oracle_memory?: string | null
          risks_that_mattered?: string | null
          signals_that_preceded_it?: string | null
          source_reference?: string | null
          source_type?: string | null
          stakeholder_dynamics?: string | null
          state?: string | null
          updated_at?: string | null
          why_it_happened?: string | null
          win_themes_that_failed?: string | null
          win_themes_that_landed?: string | null
        }
        Update: {
          client_name?: string | null
          competitor_dynamics?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string | null
          decision_summary?: string | null
          decision_type?: string | null
          evaluator_priorities?: string | null
          id?: string
          key_influencers?: string | null
          lessons_for_future_missions?: string | null
          mission_id?: string | null
          outcome?: string | null
          procurement_name?: string | null
          reusable_oracle_memory?: string | null
          risks_that_mattered?: string | null
          signals_that_preceded_it?: string | null
          source_reference?: string | null
          source_type?: string | null
          stakeholder_dynamics?: string | null
          state?: string | null
          updated_at?: string | null
          why_it_happened?: string | null
          win_themes_that_failed?: string | null
          win_themes_that_landed?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_decision_intelligence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_engagement_config: {
        Row: {
          central_claim: string | null
          competitors: Json
          created_at: string
          discriminators: Json
          evaluator_priorities: Json
          id: string
          mission_id: string
          mission_profile: Json | null
          monitoring_mode: string
          north_star: string | null
          proof_points: Json
          signal_threshold: number
          stakeholders: Json
          status: string
          top_risks: Json
          updated_at: string
          win_themes: Json
        }
        Insert: {
          central_claim?: string | null
          competitors?: Json
          created_at?: string
          discriminators?: Json
          evaluator_priorities?: Json
          id?: string
          mission_id: string
          mission_profile?: Json | null
          monitoring_mode?: string
          north_star?: string | null
          proof_points?: Json
          signal_threshold?: number
          stakeholders?: Json
          status?: string
          top_risks?: Json
          updated_at?: string
          win_themes?: Json
        }
        Update: {
          central_claim?: string | null
          competitors?: Json
          created_at?: string
          discriminators?: Json
          evaluator_priorities?: Json
          id?: string
          mission_id?: string
          mission_profile?: Json | null
          monitoring_mode?: string
          north_star?: string | null
          proof_points?: Json
          signal_threshold?: number
          stakeholders?: Json
          status?: string
          top_risks?: Json
          updated_at?: string
          win_themes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "oracle_engagement_config_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_escalation_log: {
        Row: {
          context_summary: string | null
          created_at: string | null
          escalation_type: string | null
          id: string
          mission_id: string | null
          mission_phase: string | null
          pattern_note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          sos_update_id: string | null
          submitted_by: string | null
        }
        Insert: {
          context_summary?: string | null
          created_at?: string | null
          escalation_type?: string | null
          id?: string
          mission_id?: string | null
          mission_phase?: string | null
          pattern_note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sos_update_id?: string | null
          submitted_by?: string | null
        }
        Update: {
          context_summary?: string | null
          created_at?: string | null
          escalation_type?: string | null
          id?: string
          mission_id?: string | null
          mission_phase?: string | null
          pattern_note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sos_update_id?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_escalation_log_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_health: {
        Row: {
          active_sources: number
          coverage_gaps: Json
          created_at: string
          health_status: string
          id: string
          mission_id: string
          noise_ratio: number | null
          raw_items_ingested: number
          signals_approved: number
          signals_archived: number
          signals_created: number
          total_sources: number
        }
        Insert: {
          active_sources?: number
          coverage_gaps?: Json
          created_at?: string
          health_status?: string
          id?: string
          mission_id: string
          noise_ratio?: number | null
          raw_items_ingested?: number
          signals_approved?: number
          signals_archived?: number
          signals_created?: number
          total_sources?: number
        }
        Update: {
          active_sources?: number
          coverage_gaps?: Json
          created_at?: string
          health_status?: string
          id?: string
          mission_id?: string
          noise_ratio?: number | null
          raw_items_ingested?: number
          signals_approved?: number
          signals_archived?: number
          signals_created?: number
          total_sources?: number
        }
        Relationships: [
          {
            foreignKeyName: "oracle_health_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_ingestion_queue: {
        Row: {
          classification_metadata: Json
          classified_at: string | null
          classified_category:
            | Database["public"]["Enums"]["oracle_category"]
            | null
          classified_relevance_score: number | null
          classified_subcategory:
            | Database["public"]["Enums"]["oracle_subcategory"]
            | null
          classified_summary: string | null
          classified_topic_tags: string[] | null
          classified_urgency:
            | Database["public"]["Enums"]["oracle_urgency"]
            | null
          classified_win_theme_tags: string[] | null
          error_message: string | null
          id: string
          ingested_at: string
          mission_id: string | null
          oracle_source_id: string | null
          promoted_at: string | null
          promoted_node_id: string | null
          raw_published_at: string | null
          raw_text: string
          raw_title: string
          retry_count: number
          source_name: string
          source_url: string
          state_code: string | null
          status: Database["public"]["Enums"]["oracle_ingestion_status"]
          tier: Database["public"]["Enums"]["oracle_tier"] | null
        }
        Insert: {
          classification_metadata?: Json
          classified_at?: string | null
          classified_category?:
            | Database["public"]["Enums"]["oracle_category"]
            | null
          classified_relevance_score?: number | null
          classified_subcategory?:
            | Database["public"]["Enums"]["oracle_subcategory"]
            | null
          classified_summary?: string | null
          classified_topic_tags?: string[] | null
          classified_urgency?:
            | Database["public"]["Enums"]["oracle_urgency"]
            | null
          classified_win_theme_tags?: string[] | null
          error_message?: string | null
          id?: string
          ingested_at?: string
          mission_id?: string | null
          oracle_source_id?: string | null
          promoted_at?: string | null
          promoted_node_id?: string | null
          raw_published_at?: string | null
          raw_text: string
          raw_title: string
          retry_count?: number
          source_name: string
          source_url: string
          state_code?: string | null
          status?: Database["public"]["Enums"]["oracle_ingestion_status"]
          tier?: Database["public"]["Enums"]["oracle_tier"] | null
        }
        Update: {
          classification_metadata?: Json
          classified_at?: string | null
          classified_category?:
            | Database["public"]["Enums"]["oracle_category"]
            | null
          classified_relevance_score?: number | null
          classified_subcategory?:
            | Database["public"]["Enums"]["oracle_subcategory"]
            | null
          classified_summary?: string | null
          classified_topic_tags?: string[] | null
          classified_urgency?:
            | Database["public"]["Enums"]["oracle_urgency"]
            | null
          classified_win_theme_tags?: string[] | null
          error_message?: string | null
          id?: string
          ingested_at?: string
          mission_id?: string | null
          oracle_source_id?: string | null
          promoted_at?: string | null
          promoted_node_id?: string | null
          raw_published_at?: string | null
          raw_text?: string
          raw_title?: string
          retry_count?: number
          source_name?: string
          source_url?: string
          state_code?: string | null
          status?: Database["public"]["Enums"]["oracle_ingestion_status"]
          tier?: Database["public"]["Enums"]["oracle_tier"] | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_ingestion_queue_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_ingestion_queue_oracle_source_id_fkey"
            columns: ["oracle_source_id"]
            isOneToOne: false
            referencedRelation: "oracle_source_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_ingestion_queue_promoted_node_id_fkey"
            columns: ["promoted_node_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_knowledge_base: {
        Row: {
          applicable_mission_types: string[] | null
          confidence: string | null
          core_insight: string
          created_at: string | null
          extracted_by: string | null
          id: string
          mission_id: string | null
          source_summary: string | null
          thread_id: string | null
          topic_tags: string[] | null
        }
        Insert: {
          applicable_mission_types?: string[] | null
          confidence?: string | null
          core_insight: string
          created_at?: string | null
          extracted_by?: string | null
          id?: string
          mission_id?: string | null
          source_summary?: string | null
          thread_id?: string | null
          topic_tags?: string[] | null
        }
        Update: {
          applicable_mission_types?: string[] | null
          confidence?: string | null
          core_insight?: string
          created_at?: string | null
          extracted_by?: string | null
          id?: string
          mission_id?: string | null
          source_summary?: string | null
          thread_id?: string | null
          topic_tags?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_knowledge_base_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_mission_outcomes: {
        Row: {
          competitor_observations: string | null
          completed_by: string | null
          created_at: string
          id: string
          mission_id: string | null
          outcome: string | null
          outcome_factor: string | null
          top_lesson: string | null
          win_theme_notes: string | null
        }
        Insert: {
          competitor_observations?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          outcome?: string | null
          outcome_factor?: string | null
          top_lesson?: string | null
          win_theme_notes?: string | null
        }
        Update: {
          competitor_observations?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          outcome?: string | null
          outcome_factor?: string | null
          top_lesson?: string | null
          win_theme_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_mission_outcomes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_outputs: {
        Row: {
          content: string
          created_at: string
          id: string
          mission_id: string
          output_type: string
          signal_id: string | null
          status: string
          target_question_id: string | null
          target_section_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          mission_id: string
          output_type: string
          signal_id?: string | null
          status?: string
          target_question_id?: string | null
          target_section_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          mission_id?: string
          output_type?: string
          signal_id?: string | null
          status?: string
          target_question_id?: string | null
          target_section_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_outputs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_outputs_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_quality_measures: {
        Row: {
          competitive_significance: string | null
          created_at: string
          id: string
          mco_benchmark_comparison: string | null
          mco_rate: number | null
          measure_code: string
          measure_description: string | null
          measure_domain: string | null
          measure_name: string
          measure_set: string
          measurement_year: number
          mission_id: string | null
          national_medicaid_benchmark: number | null
          national_percentile: number | null
          oracle_node_id: string | null
          prior_year_state_rate: number | null
          relevance_to_mission: string | null
          source_document: string | null
          source_url: string | null
          state_benchmark: number | null
          state_code: string
          state_current_rate: number | null
          trend_direction: string | null
          updated_at: string
        }
        Insert: {
          competitive_significance?: string | null
          created_at?: string
          id?: string
          mco_benchmark_comparison?: string | null
          mco_rate?: number | null
          measure_code: string
          measure_description?: string | null
          measure_domain?: string | null
          measure_name: string
          measure_set: string
          measurement_year: number
          mission_id?: string | null
          national_medicaid_benchmark?: number | null
          national_percentile?: number | null
          oracle_node_id?: string | null
          prior_year_state_rate?: number | null
          relevance_to_mission?: string | null
          source_document?: string | null
          source_url?: string | null
          state_benchmark?: number | null
          state_code: string
          state_current_rate?: number | null
          trend_direction?: string | null
          updated_at?: string
        }
        Update: {
          competitive_significance?: string | null
          created_at?: string
          id?: string
          mco_benchmark_comparison?: string | null
          mco_rate?: number | null
          measure_code?: string
          measure_description?: string | null
          measure_domain?: string | null
          measure_name?: string
          measure_set?: string
          measurement_year?: number
          mission_id?: string | null
          national_medicaid_benchmark?: number | null
          national_percentile?: number | null
          oracle_node_id?: string | null
          prior_year_state_rate?: number | null
          relevance_to_mission?: string | null
          source_document?: string | null
          source_url?: string | null
          state_benchmark?: number | null
          state_code?: string
          state_current_rate?: number | null
          trend_direction?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_quality_measures_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_quality_measures_oracle_node_id_fkey"
            columns: ["oracle_node_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_raw_items: {
        Row: {
          content_hash: string | null
          created_at: string
          duplicate_of: string | null
          id: string
          ingested_at: string
          mission_id: string
          published_at: string | null
          raw_text: string | null
          source_id: string | null
          status: string
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          ingested_at?: string
          mission_id: string
          published_at?: string | null
          raw_text?: string | null
          source_id?: string | null
          status?: string
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          duplicate_of?: string | null
          id?: string
          ingested_at?: string
          mission_id?: string
          published_at?: string | null
          raw_text?: string | null
          source_id?: string | null
          status?: string
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_raw_items_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "oracle_raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_raw_items_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "oracle_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_risk_patterns: {
        Row: {
          created_at: string
          example_missions: string[]
          id: string
          last_seen_at: string
          risk_category: string | null
          risk_title: string
          times_materialized: number
          times_seen: number
        }
        Insert: {
          created_at?: string
          example_missions?: string[]
          id?: string
          last_seen_at?: string
          risk_category?: string | null
          risk_title: string
          times_materialized?: number
          times_seen?: number
        }
        Update: {
          created_at?: string
          example_missions?: string[]
          id?: string
          last_seen_at?: string
          risk_category?: string | null
          risk_title?: string
          times_materialized?: number
          times_seen?: number
        }
        Relationships: []
      }
      oracle_sdoh_data: {
        Row: {
          created_at: string
          data_source: string
          data_year: number
          geography_fips: string | null
          geography_name: string
          geography_type: string
          id: string
          medicaid_population_rate: number | null
          mission_id: string | null
          national_benchmark: number | null
          population_affected: number | null
          prevalence_rate: number | null
          priority_level: string | null
          sdoh_domain: string
          sdoh_measure: string
          source_url: string | null
          state_benchmark: number | null
          state_code: string
          trend_direction: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source: string
          data_year: number
          geography_fips?: string | null
          geography_name: string
          geography_type: string
          id?: string
          medicaid_population_rate?: number | null
          mission_id?: string | null
          national_benchmark?: number | null
          population_affected?: number | null
          prevalence_rate?: number | null
          priority_level?: string | null
          sdoh_domain: string
          sdoh_measure: string
          source_url?: string | null
          state_benchmark?: number | null
          state_code: string
          trend_direction?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: string
          data_year?: number
          geography_fips?: string | null
          geography_name?: string
          geography_type?: string
          id?: string
          medicaid_population_rate?: number | null
          mission_id?: string | null
          national_benchmark?: number | null
          population_affected?: number | null
          prevalence_rate?: number | null
          priority_level?: string | null
          sdoh_domain?: string
          sdoh_measure?: string
          source_url?: string | null
          state_benchmark?: number | null
          state_code?: string
          trend_direction?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_sdoh_data_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_signal_belief_links: {
        Row: {
          belief_id: string
          created_at: string
          explanation: string | null
          id: string
          relationship: string
          signal_id: string
        }
        Insert: {
          belief_id: string
          created_at?: string
          explanation?: string | null
          id?: string
          relationship: string
          signal_id: string
        }
        Update: {
          belief_id?: string
          created_at?: string
          explanation?: string | null
          id?: string
          relationship?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_signal_belief_links_belief_id_fkey"
            columns: ["belief_id"]
            isOneToOne: false
            referencedRelation: "oracle_beliefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_signal_belief_links_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_signal_tags: {
        Row: {
          created_at: string
          id: string
          signal_id: string
          tag_type: string
          tag_value: string
        }
        Insert: {
          created_at?: string
          id?: string
          signal_id: string
          tag_type: string
          tag_value: string
        }
        Update: {
          created_at?: string
          id?: string
          signal_id?: string
          tag_type?: string
          tag_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_signal_tags_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_signals: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          authority: Database["public"]["Enums"]["oracle_authority"]
          authority_weight: number
          category: Database["public"]["Enums"]["oracle_category"] | null
          confidence_score: number
          created_at: string
          effective_date: string | null
          expiration_date: string | null
          id: string
          impact_score: number
          ingestion_source: string
          is_superseded: boolean
          jpb_variable_tags: string[]
          last_verified_at: string
          metadata: Json
          mission_id: string | null
          oracle_score: number | null
          published_at: string | null
          question_type_tags: string[]
          raw_item_id: string | null
          recommended_action: string | null
          relevance_score: number
          scope_tier: string
          signal_type: string
          source_name: string | null
          state_code: string | null
          status: string
          subcategory: Database["public"]["Enums"]["oracle_subcategory"] | null
          summary: string | null
          superseded_by: string | null
          taxonomy_node_ids: string[]
          tier: Database["public"]["Enums"]["oracle_tier"]
          title: string
          topic_tags: string[]
          updated_at: string
          urgency: Database["public"]["Enums"]["oracle_urgency"]
          urgency_score: number
          visibility: string
          what_happened: string | null
          why_it_matters: string | null
          win_theme_tags: string[]
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          authority?: Database["public"]["Enums"]["oracle_authority"]
          authority_weight?: number
          category?: Database["public"]["Enums"]["oracle_category"] | null
          confidence_score?: number
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          impact_score?: number
          ingestion_source?: string
          is_superseded?: boolean
          jpb_variable_tags?: string[]
          last_verified_at?: string
          metadata?: Json
          mission_id?: string | null
          oracle_score?: number | null
          published_at?: string | null
          question_type_tags?: string[]
          raw_item_id?: string | null
          recommended_action?: string | null
          relevance_score?: number
          scope_tier?: string
          signal_type: string
          source_name?: string | null
          state_code?: string | null
          status?: string
          subcategory?: Database["public"]["Enums"]["oracle_subcategory"] | null
          summary?: string | null
          superseded_by?: string | null
          taxonomy_node_ids?: string[]
          tier?: Database["public"]["Enums"]["oracle_tier"]
          title: string
          topic_tags?: string[]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["oracle_urgency"]
          urgency_score?: number
          visibility?: string
          what_happened?: string | null
          why_it_matters?: string | null
          win_theme_tags?: string[]
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          authority?: Database["public"]["Enums"]["oracle_authority"]
          authority_weight?: number
          category?: Database["public"]["Enums"]["oracle_category"] | null
          confidence_score?: number
          created_at?: string
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          impact_score?: number
          ingestion_source?: string
          is_superseded?: boolean
          jpb_variable_tags?: string[]
          last_verified_at?: string
          metadata?: Json
          mission_id?: string | null
          oracle_score?: number | null
          published_at?: string | null
          question_type_tags?: string[]
          raw_item_id?: string | null
          recommended_action?: string | null
          relevance_score?: number
          scope_tier?: string
          signal_type?: string
          source_name?: string | null
          state_code?: string | null
          status?: string
          subcategory?: Database["public"]["Enums"]["oracle_subcategory"] | null
          summary?: string | null
          superseded_by?: string | null
          taxonomy_node_ids?: string[]
          tier?: Database["public"]["Enums"]["oracle_tier"]
          title?: string
          topic_tags?: string[]
          updated_at?: string
          urgency?: Database["public"]["Enums"]["oracle_urgency"]
          urgency_score?: number
          visibility?: string
          what_happened?: string | null
          why_it_matters?: string | null
          win_theme_tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "oracle_signals_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_signals_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: false
            referencedRelation: "oracle_raw_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_signals_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_sme_profiles: {
        Row: {
          created_at: string | null
          domain_tags: string[] | null
          id: string
          last_active_at: string | null
          mission_types_supported: string[] | null
          name: string
          organization: string | null
          title: string | null
          total_questions_answered: number | null
          total_sessions: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          domain_tags?: string[] | null
          id?: string
          last_active_at?: string | null
          mission_types_supported?: string[] | null
          name: string
          organization?: string | null
          title?: string | null
          total_questions_answered?: number | null
          total_sessions?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          domain_tags?: string[] | null
          id?: string
          last_active_at?: string | null
          mission_types_supported?: string[] | null
          name?: string
          organization?: string | null
          title?: string | null
          total_questions_answered?: number | null
          total_sessions?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      oracle_sme_sessions: {
        Row: {
          answer_summary: string | null
          created_at: string | null
          domain_tags: string[] | null
          id: string
          mission_id: string | null
          question_summary: string | null
          requesting_user_id: string | null
          sme_id: string | null
          topic: string | null
        }
        Insert: {
          answer_summary?: string | null
          created_at?: string | null
          domain_tags?: string[] | null
          id?: string
          mission_id?: string | null
          question_summary?: string | null
          requesting_user_id?: string | null
          sme_id?: string | null
          topic?: string | null
        }
        Update: {
          answer_summary?: string | null
          created_at?: string | null
          domain_tags?: string[] | null
          id?: string
          mission_id?: string | null
          question_summary?: string | null
          requesting_user_id?: string | null
          sme_id?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_sme_sessions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_sme_sessions_sme_id_fkey"
            columns: ["sme_id"]
            isOneToOne: false
            referencedRelation: "oracle_sme_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_source_registry: {
        Row: {
          check_frequency_hours: number
          created_at: string
          created_by: string | null
          default_authority: Database["public"]["Enums"]["oracle_authority"]
          default_category: Database["public"]["Enums"]["oracle_category"]
          default_subcategory: Database["public"]["Enums"]["oracle_subcategory"]
          description: string | null
          error_count: number
          error_message: string | null
          feed_url: string | null
          id: string
          last_checked_at: string | null
          last_new_item_at: string | null
          minimum_relevance_threshold: number
          mission_id: string | null
          notes: string | null
          source_name: string
          source_type: Database["public"]["Enums"]["oracle_source_type"]
          source_url: string
          state_code: string | null
          status: Database["public"]["Enums"]["oracle_source_status"]
          tier: Database["public"]["Enums"]["oracle_tier"]
          topic_filter_tags: string[]
          updated_at: string
        }
        Insert: {
          check_frequency_hours?: number
          created_at?: string
          created_by?: string | null
          default_authority?: Database["public"]["Enums"]["oracle_authority"]
          default_category: Database["public"]["Enums"]["oracle_category"]
          default_subcategory: Database["public"]["Enums"]["oracle_subcategory"]
          description?: string | null
          error_count?: number
          error_message?: string | null
          feed_url?: string | null
          id?: string
          last_checked_at?: string | null
          last_new_item_at?: string | null
          minimum_relevance_threshold?: number
          mission_id?: string | null
          notes?: string | null
          source_name: string
          source_type?: Database["public"]["Enums"]["oracle_source_type"]
          source_url: string
          state_code?: string | null
          status?: Database["public"]["Enums"]["oracle_source_status"]
          tier: Database["public"]["Enums"]["oracle_tier"]
          topic_filter_tags?: string[]
          updated_at?: string
        }
        Update: {
          check_frequency_hours?: number
          created_at?: string
          created_by?: string | null
          default_authority?: Database["public"]["Enums"]["oracle_authority"]
          default_category?: Database["public"]["Enums"]["oracle_category"]
          default_subcategory?: Database["public"]["Enums"]["oracle_subcategory"]
          description?: string | null
          error_count?: number
          error_message?: string | null
          feed_url?: string | null
          id?: string
          last_checked_at?: string | null
          last_new_item_at?: string | null
          minimum_relevance_threshold?: number
          mission_id?: string | null
          notes?: string | null
          source_name?: string
          source_type?: Database["public"]["Enums"]["oracle_source_type"]
          source_url?: string
          state_code?: string | null
          status?: Database["public"]["Enums"]["oracle_source_status"]
          tier?: Database["public"]["Enums"]["oracle_tier"]
          topic_filter_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_source_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_source_registry_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_source_registry_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_sources: {
        Row: {
          added_by: string
          category: string
          created_at: string
          id: string
          last_checked_at: string | null
          mission_id: string
          priority: string
          refresh_cadence: string
          source_name: string
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          added_by?: string
          category: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          mission_id: string
          priority?: string
          refresh_cadence?: string
          source_name: string
          source_type: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          added_by?: string
          category?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          mission_id?: string
          priority?: string
          refresh_cadence?: string
          source_name?: string
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_sources_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_taxonomy: {
        Row: {
          created_at: string
          depth: number
          description: string | null
          domain: string
          id: string
          is_leaf: boolean
          node_code: string
          node_name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          depth: number
          description?: string | null
          domain: string
          id?: string
          is_leaf?: boolean
          node_code: string
          node_name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          depth?: number
          description?: string | null
          domain?: string
          id?: string
          is_leaf?: boolean
          node_code?: string
          node_name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oracle_taxonomy_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "oracle_taxonomy"
            referencedColumns: ["id"]
          },
        ]
      }
      oracle_thread_queries: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          oracle_items_returned: Json
          query_topic: string
          question_id: string
          thread_message_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          oracle_items_returned?: Json
          query_topic: string
          question_id: string
          thread_message_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          oracle_items_returned?: Json
          query_topic?: string
          question_id?: string
          thread_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oracle_thread_queries_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_thread_queries_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oracle_thread_queries_thread_message_id_fkey"
            columns: ["thread_message_id"]
            isOneToOne: false
            referencedRelation: "thread_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      phi_rejection_log: {
        Row: {
          actor_user_id: string | null
          confidence: string | null
          created_at: string
          document_name: string | null
          engagement_id: string | null
          id: string
          patterns_matched: string[]
          resolution_type: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          surface: string
          writer_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          confidence?: string | null
          created_at?: string
          document_name?: string | null
          engagement_id?: string | null
          id?: string
          patterns_matched?: string[]
          resolution_type?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          surface: string
          writer_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          confidence?: string | null
          created_at?: string
          document_name?: string | null
          engagement_id?: string | null
          id?: string
          patterns_matched?: string[]
          resolution_type?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          surface?: string
          writer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phi_rejection_log_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_copilot_messages: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          body: string
          created_at: string
          from_name: string
          from_user_id: string
          id: string
          is_broadcast: boolean
          message_type: string
          mission_id: string
          question_id: string | null
          to_user_id: string | null
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          body: string
          created_at?: string
          from_name: string
          from_user_id: string
          id?: string
          is_broadcast?: boolean
          message_type: string
          mission_id: string
          question_id?: string | null
          to_user_id?: string | null
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          body?: string
          created_at?: string
          from_name?: string
          from_user_id?: string
          id?: string
          is_broadcast?: boolean
          message_type?: string
          mission_id?: string
          question_id?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_copilot_messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_copilot_messages_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_copilot_messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_copilot_messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_evolution_records: {
        Row: {
          analysis_completed_at: string | null
          created_at: string
          current_rfp_document_id: string | null
          id: string
          iris_recommendations: string | null
          iris_signals: string | null
          iris_summary: string | null
          material_changes: Json
          mission_id: string
          new_sections: Json
          prior_rfp_document_id: string | null
          relaxed_requirements: Json
          removed_sections: Json
          scoring_changes: Json
          tightened_requirements: Json
          updated_at: string
        }
        Insert: {
          analysis_completed_at?: string | null
          created_at?: string
          current_rfp_document_id?: string | null
          id?: string
          iris_recommendations?: string | null
          iris_signals?: string | null
          iris_summary?: string | null
          material_changes?: Json
          mission_id: string
          new_sections?: Json
          prior_rfp_document_id?: string | null
          relaxed_requirements?: Json
          removed_sections?: Json
          scoring_changes?: Json
          tightened_requirements?: Json
          updated_at?: string
        }
        Update: {
          analysis_completed_at?: string | null
          created_at?: string
          current_rfp_document_id?: string | null
          id?: string
          iris_recommendations?: string | null
          iris_signals?: string | null
          iris_summary?: string | null
          material_changes?: Json
          mission_id?: string
          new_sections?: Json
          prior_rfp_document_id?: string | null
          relaxed_requirements?: Json
          removed_sections?: Json
          scoring_changes?: Json
          tightened_requirements?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_evolution_records_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability_note: string | null
          availability_status: string
          availability_until: string | null
          avatar_color: string | null
          avatar_url: string | null
          banned_words: string[]
          certifications: string[]
          created_at: string | null
          default_mission_role: string | null
          display_name: string
          domain_depth: Json
          email: string | null
          expert_bio: string | null
          expertise_areas: string[]
          expertise_embedding: string | null
          expertise_source: string | null
          expertise_updated_at: string | null
          has_acked_threads_internal_at: string | null
          has_onboarded: boolean
          has_seen_orientation: boolean
          id: string
          is_platform_admin: boolean
          last_login_at: string | null
          last_seen_signals_at: string | null
          notable_wins: Json
          onboarded_at: string | null
          preferred_pov: string
          profile_completed: boolean
          profile_updated_at: string | null
          programs_experience: string[]
          pulse_acknowledged_at: string | null
          question_types: string[]
          score_me_disclosure_acknowledged_at: string | null
          slack_user_id: string | null
          states_experience: string[]
          timezone: string | null
          writing_voice_sample: string | null
          years_of_experience: number | null
        }
        Insert: {
          availability_note?: string | null
          availability_status?: string
          availability_until?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          banned_words?: string[]
          certifications?: string[]
          created_at?: string | null
          default_mission_role?: string | null
          display_name: string
          domain_depth?: Json
          email?: string | null
          expert_bio?: string | null
          expertise_areas?: string[]
          expertise_embedding?: string | null
          expertise_source?: string | null
          expertise_updated_at?: string | null
          has_acked_threads_internal_at?: string | null
          has_onboarded?: boolean
          has_seen_orientation?: boolean
          id: string
          is_platform_admin?: boolean
          last_login_at?: string | null
          last_seen_signals_at?: string | null
          notable_wins?: Json
          onboarded_at?: string | null
          preferred_pov?: string
          profile_completed?: boolean
          profile_updated_at?: string | null
          programs_experience?: string[]
          pulse_acknowledged_at?: string | null
          question_types?: string[]
          score_me_disclosure_acknowledged_at?: string | null
          slack_user_id?: string | null
          states_experience?: string[]
          timezone?: string | null
          writing_voice_sample?: string | null
          years_of_experience?: number | null
        }
        Update: {
          availability_note?: string | null
          availability_status?: string
          availability_until?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          banned_words?: string[]
          certifications?: string[]
          created_at?: string | null
          default_mission_role?: string | null
          display_name?: string
          domain_depth?: Json
          email?: string | null
          expert_bio?: string | null
          expertise_areas?: string[]
          expertise_embedding?: string | null
          expertise_source?: string | null
          expertise_updated_at?: string | null
          has_acked_threads_internal_at?: string | null
          has_onboarded?: boolean
          has_seen_orientation?: boolean
          id?: string
          is_platform_admin?: boolean
          last_login_at?: string | null
          last_seen_signals_at?: string | null
          notable_wins?: Json
          onboarded_at?: string | null
          preferred_pov?: string
          profile_completed?: boolean
          profile_updated_at?: string | null
          programs_experience?: string[]
          pulse_acknowledged_at?: string | null
          question_types?: string[]
          score_me_disclosure_acknowledged_at?: string | null
          slack_user_id?: string | null
          states_experience?: string[]
          timezone?: string | null
          writing_voice_sample?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      program_dna: {
        Row: {
          attribute: string
          category: string
          confidence: string | null
          created_at: string
          id: string
          last_reviewed: string | null
          program: string
          source: string | null
          updated_at: string
          value: string
        }
        Insert: {
          attribute: string
          category: string
          confidence?: string | null
          created_at?: string
          id?: string
          last_reviewed?: string | null
          program: string
          source?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          attribute?: string
          category?: string
          confidence?: string | null
          created_at?: string
          id?: string
          last_reviewed?: string | null
          program?: string
          source?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      program_intelligence: {
        Row: {
          created_at: string
          created_by: string | null
          eligibility: string | null
          id: string
          is_active: boolean
          operational_requirements: string | null
          population: string | null
          program_name: string
          proposal_implications: string | null
          quality_requirements: string | null
          refs: Json
          reporting_requirements: string | null
          service_array: string | null
          state_code: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          eligibility?: string | null
          id?: string
          is_active?: boolean
          operational_requirements?: string | null
          population?: string | null
          program_name: string
          proposal_implications?: string | null
          quality_requirements?: string | null
          refs?: Json
          reporting_requirements?: string | null
          service_array?: string | null
          state_code?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          eligibility?: string | null
          id?: string
          is_active?: boolean
          operational_requirements?: string | null
          population?: string | null
          program_name?: string
          proposal_implications?: string | null
          quality_requirements?: string | null
          refs?: Json
          reporting_requirements?: string | null
          service_array?: string | null
          state_code?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      question_assignments: {
        Row: {
          athena_sme_name: string | null
          client_sme_name: string | null
          copy_editor_name: string | null
          created_at: string | null
          dependencies: Json | null
          id: string
          internal_deadline: string | null
          mission_id: string
          notes: string | null
          question_id: string
          reviewer_name: string | null
          risk_level: string | null
          status: string | null
          updated_at: string | null
          workstream_lead: string | null
          writer_email: string | null
          writer_name: string | null
        }
        Insert: {
          athena_sme_name?: string | null
          client_sme_name?: string | null
          copy_editor_name?: string | null
          created_at?: string | null
          dependencies?: Json | null
          id?: string
          internal_deadline?: string | null
          mission_id: string
          notes?: string | null
          question_id: string
          reviewer_name?: string | null
          risk_level?: string | null
          status?: string | null
          updated_at?: string | null
          workstream_lead?: string | null
          writer_email?: string | null
          writer_name?: string | null
        }
        Update: {
          athena_sme_name?: string | null
          client_sme_name?: string | null
          copy_editor_name?: string | null
          created_at?: string | null
          dependencies?: Json | null
          id?: string
          internal_deadline?: string | null
          mission_id?: string
          notes?: string | null
          question_id?: string
          reviewer_name?: string | null
          risk_level?: string | null
          status?: string | null
          updated_at?: string | null
          workstream_lead?: string | null
          writer_email?: string | null
          writer_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_assignments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_briefs: {
        Row: {
          created_at: string
          evaluator_perspective: string | null
          generated_at: string
          generated_by_iris: boolean
          id: string
          key_messages_to_reinforce: string[] | null
          member_perspective: string | null
          mission_id: string
          proof_points: string[] | null
          provider_perspective: string | null
          question_id: string | null
          status: string
          suggested_smes: string[] | null
          things_to_avoid: string[] | null
          thread_id: string | null
          updated_at: string
          what_they_really_asking: string | null
          why_it_matters: string | null
        }
        Insert: {
          created_at?: string
          evaluator_perspective?: string | null
          generated_at?: string
          generated_by_iris?: boolean
          id?: string
          key_messages_to_reinforce?: string[] | null
          member_perspective?: string | null
          mission_id: string
          proof_points?: string[] | null
          provider_perspective?: string | null
          question_id?: string | null
          status?: string
          suggested_smes?: string[] | null
          things_to_avoid?: string[] | null
          thread_id?: string | null
          updated_at?: string
          what_they_really_asking?: string | null
          why_it_matters?: string | null
        }
        Update: {
          created_at?: string
          evaluator_perspective?: string | null
          generated_at?: string
          generated_by_iris?: boolean
          id?: string
          key_messages_to_reinforce?: string[] | null
          member_perspective?: string | null
          mission_id?: string
          proof_points?: string[] | null
          provider_perspective?: string | null
          question_id?: string | null
          status?: string
          suggested_smes?: string[] | null
          things_to_avoid?: string[] | null
          thread_id?: string | null
          updated_at?: string
          what_they_really_asking?: string | null
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_briefs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_briefs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "question_collaboration_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_collaboration_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_collaboration_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      question_connections: {
        Row: {
          confidence: string
          connection_type: string
          created_at: string
          id: string
          iris_rationale: string | null
          mission_id: string
          question_id_a: string
          question_id_b: string
        }
        Insert: {
          confidence?: string
          connection_type: string
          created_at?: string
          id?: string
          iris_rationale?: string | null
          mission_id: string
          question_id_a: string
          question_id_b: string
        }
        Update: {
          confidence?: string
          connection_type?: string
          created_at?: string
          id?: string
          iris_rationale?: string | null
          mission_id?: string
          question_id_a?: string
          question_id_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_connections_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_connections_question_id_a_fkey"
            columns: ["question_id_a"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_connections_question_id_b_fkey"
            columns: ["question_id_b"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_deadlines: {
        Row: {
          created_at: string
          deadline_type: string
          due_date: string
          id: string
          is_at_risk: boolean
          is_missed: boolean
          mission_id: string
          question_id: string
          set_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline_type: string
          due_date: string
          id?: string
          is_at_risk?: boolean
          is_missed?: boolean
          mission_id: string
          question_id: string
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline_type?: string
          due_date?: string
          id?: string
          is_at_risk?: boolean
          is_missed?: boolean
          mission_id?: string
          question_id?: string
          set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_deadlines_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_deadlines_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_feedback: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          feedback_text: string
          id: string
          max_score: number | null
          mission_id: string
          mock_score: number | null
          priority: string
          question_id: string
          resolved_at: string | null
          resolved_by: string | null
          review_cycle: string
          reviewer_id: string
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          feedback_text: string
          id?: string
          max_score?: number | null
          mission_id: string
          mock_score?: number | null
          priority?: string
          question_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_cycle: string
          reviewer_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          feedback_text?: string
          id?: string
          max_score?: number | null
          mission_id?: string
          mock_score?: number | null
          priority?: string
          question_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          review_cycle?: string
          reviewer_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_feedback_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_feedback_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
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
        ]
      }
      question_intel_links: {
        Row: {
          added_by: string
          briefing_layer: string | null
          confirmed: boolean
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          display_order: number
          id: string
          is_critical: boolean
          is_suppressed: boolean
          mission_id: string
          question_id: string
          relevance_explanation: string | null
          relevance_score: number | null
          signal_id: string | null
        }
        Insert: {
          added_by?: string
          briefing_layer?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_critical?: boolean
          is_suppressed?: boolean
          mission_id: string
          question_id: string
          relevance_explanation?: string | null
          relevance_score?: number | null
          signal_id?: string | null
        }
        Update: {
          added_by?: string
          briefing_layer?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_critical?: boolean
          is_suppressed?: boolean
          mission_id?: string
          question_id?: string
          relevance_explanation?: string | null
          relevance_score?: number | null
          signal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qil_signal_fk"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "oracle_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_intel_links_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_intel_links_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_intelligence: {
        Row: {
          best_practices: Json | null
          competitor_signals: string | null
          compliance_flags: string[] | null
          compliance_refs: Json | null
          expires_at: string | null
          generated_at: string | null
          id: string
          iris_brief: string | null
          iris_recommendations: Json | null
          key_messages: string[] | null
          mission_id: string
          oracle_prompts: Json | null
          procurement_priorities: string | null
          question_id: string
          relevant_research: string[] | null
          required_evidence: Json | null
          source_doc_refs: Json | null
          state_priorities: string | null
          updated_at: string | null
          win_themes: Json | null
        }
        Insert: {
          best_practices?: Json | null
          competitor_signals?: string | null
          compliance_flags?: string[] | null
          compliance_refs?: Json | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          iris_brief?: string | null
          iris_recommendations?: Json | null
          key_messages?: string[] | null
          mission_id: string
          oracle_prompts?: Json | null
          procurement_priorities?: string | null
          question_id: string
          relevant_research?: string[] | null
          required_evidence?: Json | null
          source_doc_refs?: Json | null
          state_priorities?: string | null
          updated_at?: string | null
          win_themes?: Json | null
        }
        Update: {
          best_practices?: Json | null
          competitor_signals?: string | null
          compliance_flags?: string[] | null
          compliance_refs?: Json | null
          expires_at?: string | null
          generated_at?: string | null
          id?: string
          iris_brief?: string | null
          iris_recommendations?: Json | null
          key_messages?: string[] | null
          mission_id?: string
          oracle_prompts?: Json | null
          procurement_priorities?: string | null
          question_id?: string
          relevant_research?: string[] | null
          required_evidence?: Json | null
          source_doc_refs?: Json | null
          state_priorities?: string | null
          updated_at?: string | null
          win_themes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "question_intelligence_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_intelligence_matches: {
        Row: {
          id: string
          matched_at: string
          mission_id: string
          question_id: string
          relevance_score: number
          result_id: string
          task_id: string
        }
        Insert: {
          id?: string
          matched_at?: string
          mission_id: string
          question_id: string
          relevance_score?: number
          result_id: string
          task_id: string
        }
        Update: {
          id?: string
          matched_at?: string
          mission_id?: string
          question_id?: string
          relevance_score?: number
          result_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_intelligence_matches_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "research_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_intelligence_matches_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "research_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      question_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          mission_id: string
          pinned_to_slack: boolean
          question_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          mission_id: string
          pinned_to_slack?: boolean
          question_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          mission_id?: string
          pinned_to_slack?: boolean
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_progress: {
        Row: {
          acceptance_status: string
          accepted_at: string | null
          assigned_at: string
          assignee_id: string
          brief_export_count: number
          brief_exported_at: string | null
          brief_opened_at: string | null
          created_at: string
          id: string
          internal_due_date: string | null
          last_activity_at: string
          max_score: number | null
          metadata: Json
          mission_id: string
          mock_score: number | null
          question_id: string
          reviewed_at: string | null
          reviewer_id: string | null
          role: string
          sme_assigned: boolean
          status: string
          status_changed_at: string
          status_changed_by: string | null
          updated_at: string
          writer_confidence: string | null
        }
        Insert: {
          acceptance_status?: string
          accepted_at?: string | null
          assigned_at?: string
          assignee_id: string
          brief_export_count?: number
          brief_exported_at?: string | null
          brief_opened_at?: string | null
          created_at?: string
          id?: string
          internal_due_date?: string | null
          last_activity_at?: string
          max_score?: number | null
          metadata?: Json
          mission_id: string
          mock_score?: number | null
          question_id: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          role?: string
          sme_assigned?: boolean
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
          writer_confidence?: string | null
        }
        Update: {
          acceptance_status?: string
          accepted_at?: string | null
          assigned_at?: string
          assignee_id?: string
          brief_export_count?: number
          brief_exported_at?: string | null
          brief_opened_at?: string | null
          created_at?: string
          id?: string
          internal_due_date?: string | null
          last_activity_at?: string
          max_score?: number | null
          metadata?: Json
          mission_id?: string
          mock_score?: number | null
          question_id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          role?: string
          sme_assigned?: boolean
          status?: string
          status_changed_at?: string
          status_changed_by?: string | null
          updated_at?: string
          writer_confidence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_progress_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_pulses: {
        Row: {
          blocked: boolean
          blocked_reason: string | null
          confidence: number
          created_at: string
          hedging_score: number
          id: string
          mission_id: string
          note: string | null
          progress: number
          question_id: string | null
          submitted_at: string
          writer_auth_user_id: string
        }
        Insert: {
          blocked?: boolean
          blocked_reason?: string | null
          confidence: number
          created_at?: string
          hedging_score?: number
          id?: string
          mission_id: string
          note?: string | null
          progress: number
          question_id?: string | null
          submitted_at?: string
          writer_auth_user_id: string
        }
        Update: {
          blocked?: boolean
          blocked_reason?: string | null
          confidence?: number
          created_at?: string
          hedging_score?: number
          id?: string
          mission_id?: string
          note?: string | null
          progress?: number
          question_id?: string | null
          submitted_at?: string
          writer_auth_user_id?: string
        }
        Relationships: []
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
            foreignKeyName: "question_relationships_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_relationships_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
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
            foreignKeyName: "question_scores_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_scores_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      question_views: {
        Row: {
          id: string
          mission_id: string
          question_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          question_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          mission_id?: string
          question_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          admin_notes: string | null
          architecture_version: string | null
          compliance_requirements: Json | null
          created_at: string | null
          deliverables: Json | null
          evaluation_criteria: Json | null
          id: string
          mission_id: string
          page_limit: number | null
          question_name: string | null
          question_number: string | null
          question_text: string | null
          requirements: Json | null
          section: string | null
          sort_order: number | null
          status: string | null
          subsection: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          architecture_version?: string | null
          compliance_requirements?: Json | null
          created_at?: string | null
          deliverables?: Json | null
          evaluation_criteria?: Json | null
          id?: string
          mission_id: string
          page_limit?: number | null
          question_name?: string | null
          question_number?: string | null
          question_text?: string | null
          requirements?: Json | null
          section?: string | null
          sort_order?: number | null
          status?: string | null
          subsection?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          architecture_version?: string | null
          compliance_requirements?: Json | null
          created_at?: string | null
          deliverables?: Json | null
          evaluation_criteria?: Json | null
          id?: string
          mission_id?: string
          page_limit?: number | null
          question_name?: string | null
          question_number?: string | null
          question_text?: string | null
          requirements?: Json | null
          section?: string | null
          sort_order?: number | null
          status?: string | null
          subsection?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
            foreignKeyName: "reality_updates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reality_updates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      research_results: {
        Row: {
          answer: string
          confidence: string
          embedding: string | null
          follow_up_questions: string[] | null
          generated_at: string
          id: string
          mission_id: string
          sources: Json
          task_id: string
        }
        Insert: {
          answer: string
          confidence?: string
          embedding?: string | null
          follow_up_questions?: string[] | null
          generated_at?: string
          id?: string
          mission_id: string
          sources?: Json
          task_id: string
        }
        Update: {
          answer?: string
          confidence?: string
          embedding?: string | null
          follow_up_questions?: string[] | null
          generated_at?: string
          id?: string
          mission_id?: string
          sources?: Json
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_results_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "research_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      research_tasks: {
        Row: {
          created_at: string
          dna_id: string | null
          id: string
          mission_id: string
          priority: string
          question: string
          relevant_question_ids: string[] | null
          relevant_rfp_sections: string[] | null
          status: string
          updated_at: string
          why_it_matters: string | null
        }
        Insert: {
          created_at?: string
          dna_id?: string | null
          id?: string
          mission_id: string
          priority?: string
          question: string
          relevant_question_ids?: string[] | null
          relevant_rfp_sections?: string[] | null
          status?: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Update: {
          created_at?: string
          dna_id?: string | null
          id?: string
          mission_id?: string
          priority?: string
          question?: string
          relevant_question_ids?: string[] | null
          relevant_rfp_sections?: string[] | null
          status?: string
          updated_at?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_tasks_dna_id_fkey"
            columns: ["dna_id"]
            isOneToOne: false
            referencedRelation: "mission_intelligence_dna"
            referencedColumns: ["id"]
          },
        ]
      }
      rfp_amendments: {
        Row: {
          amendment_type: string
          analyzed_at: string | null
          analyzed_by: string | null
          base_rfp_document_id: string | null
          created_at: string
          critical_changes: number
          document_id: string
          error_message: string | null
          id: string
          mission_id: string
          status: string
          summary: string | null
          total_changes: number
        }
        Insert: {
          amendment_type: string
          analyzed_at?: string | null
          analyzed_by?: string | null
          base_rfp_document_id?: string | null
          created_at?: string
          critical_changes?: number
          document_id: string
          error_message?: string | null
          id?: string
          mission_id: string
          status?: string
          summary?: string | null
          total_changes?: number
        }
        Update: {
          amendment_type?: string
          analyzed_at?: string | null
          analyzed_by?: string | null
          base_rfp_document_id?: string | null
          created_at?: string
          critical_changes?: number
          document_id?: string
          error_message?: string | null
          id?: string
          mission_id?: string
          status?: string
          summary?: string | null
          total_changes?: number
        }
        Relationships: []
      }
      score_me_history: {
        Row: {
          created_at: string
          full_analysis: Json
          id: string
          mission_id: string
          projected_score: number | null
          question_id: string
          score: number
          scored_by: string
        }
        Insert: {
          created_at?: string
          full_analysis?: Json
          id?: string
          mission_id: string
          projected_score?: number | null
          question_id: string
          score: number
          scored_by: string
        }
        Update: {
          created_at?: string
          full_analysis?: Json
          id?: string
          mission_id?: string
          projected_score?: number | null
          question_id?: string
          score?: number
          scored_by?: string
        }
        Relationships: []
      }
      score_me_interactions: {
        Row: {
          action: string
          created_at: string
          dimension: string | null
          id: string
          mission_id: string | null
          question_id: string | null
          writer_id: string
        }
        Insert: {
          action: string
          created_at?: string
          dimension?: string | null
          id?: string
          mission_id?: string | null
          question_id?: string | null
          writer_id: string
        }
        Update: {
          action?: string
          created_at?: string
          dimension?: string | null
          id?: string
          mission_id?: string | null
          question_id?: string | null
          writer_id?: string
        }
        Relationships: []
      }
      score_me_sessions: {
        Row: {
          coaching_summary: string | null
          created_at: string | null
          gaps: string[] | null
          id: string
          message_discipline_score: number | null
          mission_id: string | null
          overall_score: number | null
          response_text: string | null
          scored_by: string | null
          section_name: string | null
          strengths: string[] | null
          win_theme_alignment_score: number | null
        }
        Insert: {
          coaching_summary?: string | null
          created_at?: string | null
          gaps?: string[] | null
          id?: string
          message_discipline_score?: number | null
          mission_id?: string | null
          overall_score?: number | null
          response_text?: string | null
          scored_by?: string | null
          section_name?: string | null
          strengths?: string[] | null
          win_theme_alignment_score?: number | null
        }
        Update: {
          coaching_summary?: string | null
          created_at?: string | null
          gaps?: string[] | null
          id?: string
          message_discipline_score?: number | null
          mission_id?: string | null
          overall_score?: number | null
          response_text?: string | null
          scored_by?: string | null
          section_name?: string | null
          strengths?: string[] | null
          win_theme_alignment_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "score_me_sessions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      section_briefs: {
        Row: {
          answers_submitted_at: string | null
          content: Json | null
          created_at: string
          created_by: string | null
          id: string
          mission_id: string
          question_set: Json | null
          question_status: string
          questions_generated_at: string | null
          refined_brief: Json | null
          refined_brief_generated_at: string | null
          refined_brief_version: number
          section_id: string | null
          section_name: string
          updated_at: string
          writer_answers: Json | null
        }
        Insert: {
          answers_submitted_at?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id: string
          question_set?: Json | null
          question_status?: string
          questions_generated_at?: string | null
          refined_brief?: Json | null
          refined_brief_generated_at?: string | null
          refined_brief_version?: number
          section_id?: string | null
          section_name: string
          updated_at?: string
          writer_answers?: Json | null
        }
        Update: {
          answers_submitted_at?: string | null
          content?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          mission_id?: string
          question_set?: Json | null
          question_status?: string
          questions_generated_at?: string | null
          refined_brief?: Json | null
          refined_brief_generated_at?: string | null
          refined_brief_version?: number
          section_id?: string | null
          section_name?: string
          updated_at?: string
          writer_answers?: Json | null
        }
        Relationships: []
      }
      signal_patterns: {
        Row: {
          created_at: string
          id: string
          mission_id: string
          signal_topic: string | null
          signal_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          mission_id: string
          signal_topic?: string | null
          signal_type: string
        }
        Update: {
          created_at?: string
          id?: string
          mission_id?: string
          signal_topic?: string | null
          signal_type?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          classified_as: string | null
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
          reviewed: boolean | null
          reviewed_by: string | null
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
          classified_as?: string | null
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
          reviewed?: boolean | null
          reviewed_by?: string | null
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
          classified_as?: string | null
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
          reviewed?: boolean | null
          reviewed_by?: string | null
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
        Relationships: [
          {
            foreignKeyName: "signals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholder_profiles: {
        Row: {
          created_at: string
          graph_node_id: string | null
          id: string
          iris_confidence: string
          iris_sources: Json
          is_manually_added: boolean
          known_concerns: string | null
          mission_id: string
          name: string
          organization: string | null
          public_priorities: string | null
          recent_statements: Json
          relationship_to_athena: string | null
          relationship_to_incumbent: string | null
          stakeholder_type: string
          sub_type: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          graph_node_id?: string | null
          id?: string
          iris_confidence?: string
          iris_sources?: Json
          is_manually_added?: boolean
          known_concerns?: string | null
          mission_id: string
          name: string
          organization?: string | null
          public_priorities?: string | null
          recent_statements?: Json
          relationship_to_athena?: string | null
          relationship_to_incumbent?: string | null
          stakeholder_type: string
          sub_type?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          graph_node_id?: string | null
          id?: string
          iris_confidence?: string
          iris_sources?: Json
          is_manually_added?: boolean
          known_concerns?: string | null
          mission_id?: string
          name?: string
          organization?: string | null
          public_priorities?: string | null
          recent_statements?: Json
          relationship_to_athena?: string | null
          relationship_to_incumbent?: string | null
          stakeholder_type?: string
          sub_type?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stakeholder_profiles_graph_node_id_fkey"
            columns: ["graph_node_id"]
            isOneToOne: false
            referencedRelation: "intelligence_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakeholder_profiles_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      state_comparables: {
        Row: {
          approach: string
          created_at: string
          id: string
          outcome: string | null
          program_name: string
          source_url: string | null
          state: string
          tags: string[]
          topic: string
          updated_at: string
        }
        Insert: {
          approach: string
          created_at?: string
          id?: string
          outcome?: string | null
          program_name: string
          source_url?: string | null
          state: string
          tags?: string[]
          topic: string
          updated_at?: string
        }
        Update: {
          approach?: string
          created_at?: string
          id?: string
          outcome?: string | null
          program_name?: string
          source_url?: string | null
          state?: string
          tags?: string[]
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      state_dna: {
        Row: {
          attribute: string
          category: string
          confidence: string | null
          created_at: string
          id: string
          last_reviewed: string | null
          source: string | null
          state: string
          updated_at: string
          value: string
        }
        Insert: {
          attribute: string
          category: string
          confidence?: string | null
          created_at?: string
          id?: string
          last_reviewed?: string | null
          source?: string | null
          state: string
          updated_at?: string
          value: string
        }
        Update: {
          attribute?: string
          category?: string
          confidence?: string | null
          created_at?: string
          id?: string
          last_reviewed?: string | null
          source?: string | null
          state?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      state_intel_documents: {
        Row: {
          category: Database["public"]["Enums"]["state_intel_category"]
          description: string | null
          effective_date: string | null
          expires_at: string | null
          file_size: number | null
          id: string
          is_current: boolean
          mime_type: string | null
          state_code: string
          storage_path: string
          title: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["state_intel_category"]
          description?: string | null
          effective_date?: string | null
          expires_at?: string | null
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          state_code: string
          storage_path: string
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["state_intel_category"]
          description?: string | null
          effective_date?: string | null
          expires_at?: string | null
          file_size?: number | null
          id?: string
          is_current?: boolean
          mime_type?: string | null
          state_code?: string
          storage_path?: string
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_intel_documents_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "state_intel_packs"
            referencedColumns: ["state_code"]
          },
        ]
      }
      state_intel_packs: {
        Row: {
          created_at: string
          last_reviewed_at: string | null
          last_reviewed_by: string | null
          notes: string | null
          state_code: string
          state_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          notes?: string | null
          state_code: string
          state_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_reviewed_at?: string | null
          last_reviewed_by?: string | null
          notes?: string | null
          state_code?: string
          state_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      state_intelligence: {
        Row: {
          citations: string[]
          content: string
          created_at: string
          created_by: string | null
          id: string
          last_verified_at: string | null
          section: string
          sources: Json
          state_code: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          citations?: string[]
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_verified_at?: string | null
          section: string
          sources?: Json
          state_code: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          citations?: string[]
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_verified_at?: string | null
          section?: string
          sources?: Json
          state_code?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_requests: {
        Row: {
          assigned_to: string | null
          body: string
          category: string
          context: string | null
          created_at: string
          id: string
          mission_id: string | null
          requester_id: string
          resolved_at: string | null
          status: string
          urgency: string
        }
        Insert: {
          assigned_to?: string | null
          body: string
          category: string
          context?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          requester_id: string
          resolved_at?: string | null
          status?: string
          urgency?: string
        }
        Update: {
          assigned_to?: string | null
          body?: string
          category?: string
          context?: string | null
          created_at?: string
          id?: string
          mission_id?: string | null
          requester_id?: string
          resolved_at?: string | null
          status?: string
          urgency?: string
        }
        Relationships: []
      }
      support_responses: {
        Row: {
          body: string
          created_at: string
          id: string
          request_id: string
          responder_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          request_id: string
          responder_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          request_id?: string
          responder_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_requests"
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
      team_updates: {
        Row: {
          body: string
          created_at: string
          id: string
          metadata: Json
          mission_id: string
          question_id: string | null
          resolved: boolean
          resolved_at: string | null
          sender_id: string | null
          sender_name: string
          severity: string | null
          update_type: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id: string
          question_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          sender_id?: string | null
          sender_name: string
          severity?: string | null
          update_type: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          metadata?: Json
          mission_id?: string
          question_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          sender_id?: string | null
          sender_name?: string
          severity?: string | null
          update_type?: string
        }
        Relationships: []
      }
      thread_messages: {
        Row: {
          created_at: string
          id: string
          iris_action: string | null
          message_body: string
          message_type: string
          metadata: Json
          mission_id: string
          question_id: string
          sender_id: string | null
          sender_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          iris_action?: string | null
          message_body: string
          message_type?: string
          metadata?: Json
          mission_id: string
          question_id: string
          sender_id?: string | null
          sender_name: string
        }
        Update: {
          created_at?: string
          id?: string
          iris_action?: string | null
          message_body?: string
          message_type?: string
          metadata?: Json
          mission_id?: string
          question_id?: string
          sender_id?: string | null
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "mission_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          mission_id: string
          object_id: string
          object_type: Database["public"]["Enums"]["thread_object_type"]
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          mission_id: string
          object_id: string
          object_type: Database["public"]["Enums"]["thread_object_type"]
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          mission_id?: string
          object_id?: string
          object_type?: Database["public"]["Enums"]["thread_object_type"]
        }
        Relationships: []
      }
      user_expertise: {
        Row: {
          added_at: string
          custom_label: string | null
          display_order: number
          expertise_id: string | null
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          added_at?: string
          custom_label?: string | null
          display_order?: number
          expertise_id?: string | null
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          added_at?: string
          custom_label?: string | null
          display_order?: number
          expertise_id?: string | null
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_expertise_expertise_id_fkey"
            columns: ["expertise_id"]
            isOneToOne: false
            referencedRelation: "expertise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
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
          created_by_system: boolean
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
          created_by_system?: boolean
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
          created_by_system?: boolean
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
            foreignKeyName: "win_themes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      writer_deletion_requests: {
        Row: {
          fulfillment_method: string | null
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          request_received_at: string
          request_source: string | null
          requested_by: string | null
          subject_name: string | null
          writer_email: string
          writer_id: string | null
        }
        Insert: {
          fulfillment_method?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_received_at?: string
          request_source?: string | null
          requested_by?: string | null
          subject_name?: string | null
          writer_email: string
          writer_id?: string | null
        }
        Update: {
          fulfillment_method?: string | null
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_received_at?: string
          request_source?: string | null
          requested_by?: string | null
          subject_name?: string | null
          writer_email?: string
          writer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writer_deletion_requests_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      writer_identities: {
        Row: {
          created_at: string
          deleted_at: string | null
          deletion_reason: string | null
          deletion_requested_by: string | null
          display_name: string
          id: string
          is_active: boolean
          merged_into_id: string | null
          metadata: Json
          primary_email: string | null
          pulse_acknowledged_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_by?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          merged_into_id?: string | null
          metadata?: Json
          primary_email?: string | null
          pulse_acknowledged_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deletion_reason?: string | null
          deletion_requested_by?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          merged_into_id?: string | null
          metadata?: Json
          primary_email?: string | null
          pulse_acknowledged_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "writer_identities_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      writer_identity_aliases: {
        Row: {
          alias_kind: string
          alias_value: string
          created_at: string
          id: string
          verified: boolean
          writer_id: string
        }
        Insert: {
          alias_kind: string
          alias_value: string
          created_at?: string
          id?: string
          verified?: boolean
          writer_id: string
        }
        Update: {
          alias_kind?: string
          alias_value?: string
          created_at?: string
          id?: string
          verified?: boolean
          writer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "writer_identity_aliases_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      collective_memory_sanitized: {
        Row: {
          detail: string | null
          id: string | null
          kind: string | null
          outcome: string | null
          program_name: string | null
          promoted_at: string | null
          reviewed_at: string | null
          score_delta: number | null
          source: string | null
          state_code: string | null
          summary: string | null
          tags: string[] | null
        }
        Insert: {
          detail?: string | null
          id?: string | null
          kind?: string | null
          outcome?: string | null
          program_name?: string | null
          promoted_at?: string | null
          reviewed_at?: string | null
          score_delta?: number | null
          source?: never
          state_code?: string | null
          summary?: string | null
          tags?: string[] | null
        }
        Update: {
          detail?: string | null
          id?: string | null
          kind?: string | null
          outcome?: string | null
          program_name?: string | null
          promoted_at?: string | null
          reviewed_at?: string | null
          score_delta?: number | null
          source?: never
          state_code?: string | null
          summary?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      expertise_user_index: {
        Row: {
          expertise_id: string | null
          is_primary: boolean | null
          user_id: string | null
        }
        Insert: {
          expertise_id?: string | null
          is_primary?: boolean | null
          user_id?: string | null
        }
        Update: {
          expertise_id?: string | null
          is_primary?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_expertise_expertise_id_fkey"
            columns: ["expertise_id"]
            isOneToOne: false
            referencedRelation: "expertise_library"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_directory: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      pulse_aggregates: {
        Row: {
          avg_confidence: number | null
          avg_hedging: number | null
          avg_progress: number | null
          blocked_pct: number | null
          day: string | null
          distinct_writers: number | null
          mission_id: string | null
          pulse_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_old_signals: { Args: never; Returns: number }
      athena_pipeline_jobs: {
        Args: never
        Returns: {
          active: boolean
          jobid: number
          jobname: string
          last_run_at: string
          last_status: string
          schedule: string
        }[]
      }
      calc_atlas_profile_completeness: {
        Args: {
          p_atlas_invite_status: string
          p_atlas_role: string
          p_avatar_url: string
          p_email: string
          p_first_name: string
          p_hipaa: boolean
          p_job_title: string
          p_last_name: string
          p_phone: string
          p_resume_url: string
          p_skills: string[]
        }
        Returns: number
      }
      calculate_mission_momentum: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      calculate_question_health: {
        Args: { p_question_id: string }
        Returns: string
      }
      call_hook: { Args: { path: string }; Returns: undefined }
      can_manage_mission_assignments: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
      }
      cleanup_quick_chats: { Args: never; Returns: undefined }
      current_atlas_member_id: { Args: never; Returns: string }
      current_user_is_admin_or_founder: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      developer_reset_all_mission_data: {
        Args: { p_caller: string }
        Returns: Json
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_app_base_url: { Args: never; Returns: string }
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
      get_user_state: { Args: { _email: string }; Returns: string }
      has_mission_role: {
        Args: { _mission_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_thread_access: {
        Args: { _thread_id: string; _user_id: string }
        Returns: boolean
      }
      iris_pipeline_jobs: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      iris_pipeline_jobs_admin: {
        Args: never
        Returns: {
          active: boolean
          command: string
          jobid: number
          jobname: string
          schedule: string
        }[]
      }
      iris_pipeline_recent_runs: {
        Args: { _jobid: number; _limit?: number }
        Returns: {
          end_time: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      iris_pipeline_recent_runs_admin: {
        Args: { _jobid: number; _limit?: number }
        Returns: {
          end_time: string
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      is_mission_creator: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
      }
      is_mission_member: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
      }
      is_mission_member_user: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
      }
      is_mission_team_member: {
        Args: { _mission_id: string; _user_id: string }
        Returns: boolean
      }
      is_olympus_user: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      leadership_count: { Args: { _engagement_id: string }; Returns: number }
      list_mission_scoped_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      match_intel_to_questions: {
        Args: {
          max_questions?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          mission_id: string
          question_id: string
          similarity: number
        }[]
      }
      match_iris_context: {
        Args: { p_k?: number; p_mission_id: string; p_query: string }
        Returns: {
          content_text: string
          id: string
          mission_id: string
          scope: string
          similarity: number
          source_id: string
          source_table: string
        }[]
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
      prune_pulse_free_text: { Args: never; Returns: number }
      prune_score_me_full_analysis: { Args: never; Returns: number }
      query_oracle: {
        Args: {
          p_limit_per_branch?: number
          p_mission_id: string
          p_question_id: string
          p_taxonomy_codes: string[]
        }
        Returns: Json
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
      refresh_iris_expertise_coverage: { Args: never; Returns: undefined }
      resolve_writer_identity: {
        Args: { _auth_user_id: string; _display_name?: string; _email?: string }
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
      set_mission_slack_webhook: {
        Args: { _mission_id: string; _webhook: string }
        Returns: undefined
      }
      shares_mission_with: {
        Args: { _other_user_id: string }
        Returns: boolean
      }
      sync_pens_down_availability: { Args: never; Returns: undefined }
      user_has_any_leadership_role: {
        Args: { _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "lead"
        | "writer"
        | "sme"
        | "project_manager"
        | "engagement_lead"
        | "executive"
      briefing_type: "global" | "direct"
      executive_decision_source: "team" | "iris"
      executive_decision_status:
        | "pending"
        | "decided"
        | "delegated"
        | "needs_context"
      executive_decision_urgency: "urgent" | "standard"
      iris_portfolio_intel_type:
        | "org_risk"
        | "capacity"
        | "opportunity"
        | "positive"
      oracle_authority: "primary" | "secondary" | "tertiary" | "field"
      oracle_category:
        | "regulatory_federal"
        | "regulatory_state"
        | "quality_performance"
        | "health_outcomes_sdoh"
        | "policy_innovation"
        | "evidence_base"
        | "field_intelligence"
        | "competitive_landscape"
        | "client_content_map"
      oracle_ingestion_status:
        | "pending"
        | "classifying"
        | "classified"
        | "dismissed"
        | "error"
        | "promoted"
      oracle_source_status: "active" | "paused" | "error" | "deprecated"
      oracle_source_type: "rss_feed" | "html_scrape" | "api" | "manual_only"
      oracle_subcategory:
        | "statute"
        | "federal_regulation"
        | "federal_guidance"
        | "waiver_1115"
        | "waiver_1915b"
        | "waiver_1915c"
        | "federal_policy"
        | "state_plan"
        | "state_waiver_condition"
        | "state_regulation"
        | "state_contract_requirement"
        | "state_guidance"
        | "hedis_measure"
        | "eqro_finding"
        | "nci_domain"
        | "cahps_measure"
        | "state_quality_benchmark"
        | "mco_performance"
        | "population_health"
        | "sdoh_prevalence"
        | "health_equity_metric"
        | "health_outcome_benchmark"
        | "pain_point"
        | "gap_analysis"
        | "cmmi_model"
        | "demonstration_project"
        | "federal_grant"
        | "state_grant"
        | "vbp_model"
        | "emerging_policy"
        | "peer_reviewed"
        | "federal_agency_publication"
        | "foundation_report"
        | "clinical_practice_guideline"
        | "best_practice_framework"
        | "systematic_review"
        | "advocacy_position"
        | "conference_presentation"
        | "legislative_testimony"
        | "industry_association"
        | "news_media"
        | "stakeholder_communication"
        | "forum_notes"
        | "competitor_profile"
        | "prior_award_pattern"
        | "competitor_strength"
        | "competitor_weakness"
        | "incumbent_vulnerability"
        | "differentiation_opportunity"
        | "win_theme"
        | "proof_point_category"
        | "program_description"
        | "performance_highlight"
        | "content_pointer"
      oracle_tier: "platform" | "state" | "mission"
      oracle_urgency: "immediate" | "high" | "normal" | "low" | "archived"
      response_template_element_type:
        | "header"
        | "subsection"
        | "field"
        | "table"
        | "word_limit"
      response_template_source: "upload" | "manual"
      response_template_status: "active" | "skipped"
      state_intel_category:
        | "waivers_authorities"
        | "state_plan_amendments"
        | "managed_care_landscape"
        | "quality_strategy"
        | "directed_payments"
        | "core_set_performance"
        | "legislative_budget"
        | "rate_setting"
        | "eligibility_enrollment"
        | "workforce_network"
        | "demographics_health"
        | "litigation_compliance"
      thread_object_type:
        | "question_record"
        | "deliverable"
        | "iris_output"
        | "milestone"
      vault_doc_type:
        | "data_security"
        | "contract"
        | "scope_of_work"
        | "style_guide"
        | "other"
        | "dpa"
        | "outline_template"
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
    Enums: {
      app_role: [
        "admin",
        "lead",
        "writer",
        "sme",
        "project_manager",
        "engagement_lead",
        "executive",
      ],
      briefing_type: ["global", "direct"],
      executive_decision_source: ["team", "iris"],
      executive_decision_status: [
        "pending",
        "decided",
        "delegated",
        "needs_context",
      ],
      executive_decision_urgency: ["urgent", "standard"],
      iris_portfolio_intel_type: [
        "org_risk",
        "capacity",
        "opportunity",
        "positive",
      ],
      oracle_authority: ["primary", "secondary", "tertiary", "field"],
      oracle_category: [
        "regulatory_federal",
        "regulatory_state",
        "quality_performance",
        "health_outcomes_sdoh",
        "policy_innovation",
        "evidence_base",
        "field_intelligence",
        "competitive_landscape",
        "client_content_map",
      ],
      oracle_ingestion_status: [
        "pending",
        "classifying",
        "classified",
        "dismissed",
        "error",
        "promoted",
      ],
      oracle_source_status: ["active", "paused", "error", "deprecated"],
      oracle_source_type: ["rss_feed", "html_scrape", "api", "manual_only"],
      oracle_subcategory: [
        "statute",
        "federal_regulation",
        "federal_guidance",
        "waiver_1115",
        "waiver_1915b",
        "waiver_1915c",
        "federal_policy",
        "state_plan",
        "state_waiver_condition",
        "state_regulation",
        "state_contract_requirement",
        "state_guidance",
        "hedis_measure",
        "eqro_finding",
        "nci_domain",
        "cahps_measure",
        "state_quality_benchmark",
        "mco_performance",
        "population_health",
        "sdoh_prevalence",
        "health_equity_metric",
        "health_outcome_benchmark",
        "pain_point",
        "gap_analysis",
        "cmmi_model",
        "demonstration_project",
        "federal_grant",
        "state_grant",
        "vbp_model",
        "emerging_policy",
        "peer_reviewed",
        "federal_agency_publication",
        "foundation_report",
        "clinical_practice_guideline",
        "best_practice_framework",
        "systematic_review",
        "advocacy_position",
        "conference_presentation",
        "legislative_testimony",
        "industry_association",
        "news_media",
        "stakeholder_communication",
        "forum_notes",
        "competitor_profile",
        "prior_award_pattern",
        "competitor_strength",
        "competitor_weakness",
        "incumbent_vulnerability",
        "differentiation_opportunity",
        "win_theme",
        "proof_point_category",
        "program_description",
        "performance_highlight",
        "content_pointer",
      ],
      oracle_tier: ["platform", "state", "mission"],
      oracle_urgency: ["immediate", "high", "normal", "low", "archived"],
      response_template_element_type: [
        "header",
        "subsection",
        "field",
        "table",
        "word_limit",
      ],
      response_template_source: ["upload", "manual"],
      response_template_status: ["active", "skipped"],
      state_intel_category: [
        "waivers_authorities",
        "state_plan_amendments",
        "managed_care_landscape",
        "quality_strategy",
        "directed_payments",
        "core_set_performance",
        "legislative_budget",
        "rate_setting",
        "eligibility_enrollment",
        "workforce_network",
        "demographics_health",
        "litigation_compliance",
      ],
      thread_object_type: [
        "question_record",
        "deliverable",
        "iris_output",
        "milestone",
      ],
      vault_doc_type: [
        "data_security",
        "contract",
        "scope_of_work",
        "style_guide",
        "other",
        "dpa",
        "outline_template",
      ],
    },
  },
} as const
