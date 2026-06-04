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
            foreignKeyName: "atlas_knowledge_objects_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "atlas_source_question_links_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "atlas_sources_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_sources_program_code_fkey"
            columns: ["program_code"]
            isOneToOne: false
            referencedRelation: "atlas_programs"
            referencedColumns: ["program_code"]
          },
          {
            foreignKeyName: "atlas_sources_promoted_from_mission_fkey"
            columns: ["promoted_from_mission"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
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
          score_delta?: number | null
          source_mission_id?: string | null
          source_mission_name?: string | null
          state_code?: string | null
          summary?: string
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "collective_memory_source_mission_id_fkey"
            columns: ["source_mission_id"]
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
        Relationships: [
          {
            foreignKeyName: "compliance_check_results_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_check_results_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "compliance_requirements_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
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
            foreignKeyName: "contributions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_writer_id_fkey"
            columns: ["writer_id"]
            isOneToOne: false
            referencedRelation: "writer_identities"
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
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "mission_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_extractions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
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
      expertise_options: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
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
            foreignKeyName: "iris_memories_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
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
          {
            foreignKeyName: "iris_memory_usage_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_memory_usage_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "market_intelligence_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
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
      mission_outcomes: {
        Row: {
          awarded_value_usd: number | null
          created_at: string
          decided_at: string
          mission_id: string
          notes: string | null
          outcome: string
          population_impacted: number | null
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          awarded_value_usd?: number | null
          created_at?: string
          decided_at?: string
          mission_id: string
          notes?: string | null
          outcome: string
          population_impacted?: number | null
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          awarded_value_usd?: number | null
          created_at?: string
          decided_at?: string
          mission_id?: string
          notes?: string | null
          outcome?: string
          population_impacted?: number | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_outcomes_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
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
          contract_start_date: string | null
          contract_term: string | null
          contract_value: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          evaluation_criteria: Json | null
          focus_areas: string[] | null
          health: string | null
          id: string
          incumbent_name: string | null
          iris_search_terms: string[] | null
          key_requirements: string[] | null
          name: string
          page_limit: number | null
          pens_down_date: string | null
          priority_topics: string[] | null
          procurement_name: string | null
          program_type: string | null
          qa_deadline: string | null
          question_count: number | null
          rfp_extracted_at: string | null
          rfp_extraction: Json | null
          rfp_extraction_status: string | null
          rfp_number: string | null
          rfp_parsed: boolean | null
          slack_webhook: string | null
          state: string | null
          state_agency: string | null
          status: string | null
          submission_date: string | null
          win_themes: string[] | null
        }
        Insert: {
          client: string
          competitors?: string[] | null
          contract_start_date?: string | null
          contract_term?: string | null
          contract_value?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evaluation_criteria?: Json | null
          focus_areas?: string[] | null
          health?: string | null
          id?: string
          incumbent_name?: string | null
          iris_search_terms?: string[] | null
          key_requirements?: string[] | null
          name: string
          page_limit?: number | null
          pens_down_date?: string | null
          priority_topics?: string[] | null
          procurement_name?: string | null
          program_type?: string | null
          qa_deadline?: string | null
          question_count?: number | null
          rfp_extracted_at?: string | null
          rfp_extraction?: Json | null
          rfp_extraction_status?: string | null
          rfp_number?: string | null
          rfp_parsed?: boolean | null
          slack_webhook?: string | null
          state?: string | null
          state_agency?: string | null
          status?: string | null
          submission_date?: string | null
          win_themes?: string[] | null
        }
        Update: {
          client?: string
          competitors?: string[] | null
          contract_start_date?: string | null
          contract_term?: string | null
          contract_value?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          evaluation_criteria?: Json | null
          focus_areas?: string[] | null
          health?: string | null
          id?: string
          incumbent_name?: string | null
          iris_search_terms?: string[] | null
          key_requirements?: string[] | null
          name?: string
          page_limit?: number | null
          pens_down_date?: string | null
          priority_topics?: string[] | null
          procurement_name?: string | null
          program_type?: string | null
          qa_deadline?: string | null
          question_count?: number | null
          rfp_extracted_at?: string | null
          rfp_extraction?: Json | null
          rfp_extraction_status?: string | null
          rfp_number?: string | null
          rfp_parsed?: boolean | null
          slack_webhook?: string | null
          state?: string | null
          state_agency?: string | null
          status?: string | null
          submission_date?: string | null
          win_themes?: string[] | null
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
            foreignKeyName: "pilot_copilot_messages_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_copilot_messages_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "question_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_copilot_messages_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string | null
          display_name: string
          email: string | null
          expert_bio: string | null
          expertise_areas: string[]
          expertise_embedding: string | null
          has_onboarded: boolean
          id: string
          is_platform_admin: boolean
          last_seen_signals_at: string | null
          notable_wins: Json
          onboarded_at: string | null
          profile_completed: boolean
          profile_updated_at: string | null
          programs_experience: string[]
          question_types: string[]
          states_experience: string[]
        }
        Insert: {
          availability_note?: string | null
          availability_status?: string
          availability_until?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          email?: string | null
          expert_bio?: string | null
          expertise_areas?: string[]
          expertise_embedding?: string | null
          has_onboarded?: boolean
          id: string
          is_platform_admin?: boolean
          last_seen_signals_at?: string | null
          notable_wins?: Json
          onboarded_at?: string | null
          profile_completed?: boolean
          profile_updated_at?: string | null
          programs_experience?: string[]
          question_types?: string[]
          states_experience?: string[]
        }
        Update: {
          availability_note?: string | null
          availability_status?: string
          availability_until?: string | null
          avatar_color?: string | null
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          email?: string | null
          expert_bio?: string | null
          expertise_areas?: string[]
          expertise_embedding?: string | null
          has_onboarded?: boolean
          id?: string
          is_platform_admin?: boolean
          last_seen_signals_at?: string | null
          notable_wins?: Json
          onboarded_at?: string | null
          profile_completed?: boolean
          profile_updated_at?: string | null
          programs_experience?: string[]
          question_types?: string[]
          states_experience?: string[]
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
      question_records: {
        Row: {
          assigned_sme_id: string | null
          assigned_writer_id: string | null
          confidence_updated_at: string | null
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
          writer_confidence: string | null
        }
        Insert: {
          assigned_sme_id?: string | null
          assigned_writer_id?: string | null
          confidence_updated_at?: string | null
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
          writer_confidence?: string | null
        }
        Update: {
          assigned_sme_id?: string | null
          assigned_writer_id?: string | null
          confidence_updated_at?: string | null
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
          writer_confidence?: string | null
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
          response_text: string
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
          response_text: string
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
          response_text?: string
          score?: number
          scored_by?: string
        }
        Relationships: []
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
      writer_identities: {
        Row: {
          created_at: string
          display_name: string
          id: string
          merged_into_id: string | null
          metadata: Json
          primary_email: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          merged_into_id?: string | null
          metadata?: Json
          primary_email?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          merged_into_id?: string | null
          metadata?: Json
          primary_email?: string | null
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
      is_olympus_user: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      leadership_count: { Args: { _engagement_id: string }; Returns: number }
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
      sync_pens_down_availability: { Args: never; Returns: undefined }
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
