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
      ai_eval_failures: {
        Row: {
          application_id: string
          attempts: number
          failed_at: string
          id: string
          last_error: string | null
        }
        Insert: {
          application_id: string
          attempts: number
          failed_at?: string
          id?: string
          last_error?: string | null
        }
        Update: {
          application_id?: string
          attempts?: number
          failed_at?: string
          id?: string
          last_error?: string | null
        }
        Relationships: []
      }
      ai_eval_queue: {
        Row: {
          application_id: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_function_bindings: {
        Row: {
          function_key: string
          id: string
          model: string
          provider_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          function_key: string
          id?: string
          model: string
          provider_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          function_key?: string
          id?: string
          model?: string
          provider_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_function_bindings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string
          api_key_last4: string
          base_url: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          note: string | null
          updated_at: string
          vendor: string
        }
        Insert: {
          api_key_encrypted: string
          api_key_last4?: string
          base_url: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string
          vendor: string
        }
        Update: {
          api_key_encrypted?: string
          api_key_last4?: string
          base_url?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
          vendor?: string
        }
        Relationships: []
      }
      aigc_detect_failures: {
        Row: {
          application_id: string
          attempts: number
          failed_at: string
          id: string
          last_error: string | null
        }
        Insert: {
          application_id: string
          attempts: number
          failed_at?: string
          id?: string
          last_error?: string | null
        }
        Update: {
          application_id?: string
          attempts?: number
          failed_at?: string
          id?: string
          last_error?: string | null
        }
        Relationships: []
      }
      aigc_detect_queue: {
        Row: {
          application_id: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          max_attempts: number
          next_run_at: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_run_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      application_attachments: {
        Row: {
          application_id: string
          cert_name: string | null
          claimed_credit: number | null
          created_at: string
          file_hash: string | null
          file_name: string | null
          file_path: string
          id: string
          note: string | null
          order_index: number
          sort_order: number
        }
        Insert: {
          application_id: string
          cert_name?: string | null
          claimed_credit?: number | null
          created_at?: string
          file_hash?: string | null
          file_name?: string | null
          file_path: string
          id?: string
          note?: string | null
          order_index?: number
          sort_order?: number
        }
        Update: {
          application_id?: string
          cert_name?: string | null
          claimed_credit?: number | null
          created_at?: string
          file_hash?: string | null
          file_name?: string | null
          file_path?: string
          id?: string
          note?: string | null
          order_index?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "application_attachments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_attachments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "submission_summary"
            referencedColumns: ["application_id"]
          },
        ]
      }
      application_reviews: {
        Row: {
          action: Database["public"]["Enums"]["review_action"]
          application_id: string
          confidence: number | null
          created_at: string
          credit: number | null
          decision: Database["public"]["Enums"]["application_status"]
          id: string
          matched_rule_id: string | null
          note: string | null
          reviewer_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["review_action"]
          application_id: string
          confidence?: number | null
          created_at?: string
          credit?: number | null
          decision: Database["public"]["Enums"]["application_status"]
          id?: string
          matched_rule_id?: string | null
          note?: string | null
          reviewer_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["review_action"]
          application_id?: string
          confidence?: number | null
          created_at?: string
          credit?: number | null
          decision?: Database["public"]["Enums"]["application_status"]
          id?: string
          matched_rule_id?: string | null
          note?: string | null
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_reviews_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "submission_summary"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_reviews_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          achievement_name: string | null
          ai_blank_fields: string | null
          ai_check_authenticity: boolean | null
          ai_check_completeness: boolean | null
          ai_check_consistency: boolean | null
          ai_check_identity_match: boolean | null
          ai_check_logic: boolean | null
          ai_check_name_match: boolean | null
          ai_check_relevance: boolean | null
          ai_confidence: number | null
          ai_detected_achievement: string | null
          ai_detected_identity: string | null
          ai_detected_level: string | null
          ai_detected_project: string | null
          ai_detected_school: string | null
          ai_detected_student_no: string | null
          ai_identity_mismatch: string | null
          ai_intended_auto_approve: boolean
          ai_last_attempt_at: string | null
          ai_last_error: string | null
          ai_logic_issue: string | null
          ai_matched_rule_id: string | null
          ai_override_note: string | null
          ai_previous_snapshot: Json | null
          ai_reasoning: string | null
          ai_reasoning_short: string | null
          ai_suggested_credit: number | null
          aigc_checked_at: string | null
          aigc_detail: Json | null
          aigc_provider: string | null
          aigc_score: number | null
          aigc_status: string
          certificate_issued_at: string | null
          certificate_no: string | null
          claimed_credit: number | null
          college_id: string | null
          created_at: string
          credit_compliance: string | null
          credit_standard: number | null
          custom_keywords: string[]
          description: string
          face_checked_at: string | null
          face_match_note: string | null
          face_match_score: number | null
          face_match_status: string | null
          file_hash: string | null
          file_path: string | null
          final_credit: number | null
          final_review_note: string | null
          final_reviewer_id: string | null
          form_file_path: string | null
          id: string
          item_category: string | null
          item_project: string | null
          keywords_fingerprint: string | null
          level_name: string | null
          review_source: string | null
          reviewed_at: string | null
          selected_keywords: string[]
          self_rank: string | null
          status: Database["public"]["Enums"]["application_status"]
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          achievement_name?: string | null
          ai_blank_fields?: string | null
          ai_check_authenticity?: boolean | null
          ai_check_completeness?: boolean | null
          ai_check_consistency?: boolean | null
          ai_check_identity_match?: boolean | null
          ai_check_logic?: boolean | null
          ai_check_name_match?: boolean | null
          ai_check_relevance?: boolean | null
          ai_confidence?: number | null
          ai_detected_achievement?: string | null
          ai_detected_identity?: string | null
          ai_detected_level?: string | null
          ai_detected_project?: string | null
          ai_detected_school?: string | null
          ai_detected_student_no?: string | null
          ai_identity_mismatch?: string | null
          ai_intended_auto_approve?: boolean
          ai_last_attempt_at?: string | null
          ai_last_error?: string | null
          ai_logic_issue?: string | null
          ai_matched_rule_id?: string | null
          ai_override_note?: string | null
          ai_previous_snapshot?: Json | null
          ai_reasoning?: string | null
          ai_reasoning_short?: string | null
          ai_suggested_credit?: number | null
          aigc_checked_at?: string | null
          aigc_detail?: Json | null
          aigc_provider?: string | null
          aigc_score?: number | null
          aigc_status?: string
          certificate_issued_at?: string | null
          certificate_no?: string | null
          claimed_credit?: number | null
          college_id?: string | null
          created_at?: string
          credit_compliance?: string | null
          credit_standard?: number | null
          custom_keywords?: string[]
          description: string
          face_checked_at?: string | null
          face_match_note?: string | null
          face_match_score?: number | null
          face_match_status?: string | null
          file_hash?: string | null
          file_path?: string | null
          final_credit?: number | null
          final_review_note?: string | null
          final_reviewer_id?: string | null
          form_file_path?: string | null
          id?: string
          item_category?: string | null
          item_project?: string | null
          keywords_fingerprint?: string | null
          level_name?: string | null
          review_source?: string | null
          reviewed_at?: string | null
          selected_keywords?: string[]
          self_rank?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          achievement_name?: string | null
          ai_blank_fields?: string | null
          ai_check_authenticity?: boolean | null
          ai_check_completeness?: boolean | null
          ai_check_consistency?: boolean | null
          ai_check_identity_match?: boolean | null
          ai_check_logic?: boolean | null
          ai_check_name_match?: boolean | null
          ai_check_relevance?: boolean | null
          ai_confidence?: number | null
          ai_detected_achievement?: string | null
          ai_detected_identity?: string | null
          ai_detected_level?: string | null
          ai_detected_project?: string | null
          ai_detected_school?: string | null
          ai_detected_student_no?: string | null
          ai_identity_mismatch?: string | null
          ai_intended_auto_approve?: boolean
          ai_last_attempt_at?: string | null
          ai_last_error?: string | null
          ai_logic_issue?: string | null
          ai_matched_rule_id?: string | null
          ai_override_note?: string | null
          ai_previous_snapshot?: Json | null
          ai_reasoning?: string | null
          ai_reasoning_short?: string | null
          ai_suggested_credit?: number | null
          aigc_checked_at?: string | null
          aigc_detail?: Json | null
          aigc_provider?: string | null
          aigc_score?: number | null
          aigc_status?: string
          certificate_issued_at?: string | null
          certificate_no?: string | null
          claimed_credit?: number | null
          college_id?: string | null
          created_at?: string
          credit_compliance?: string | null
          credit_standard?: number | null
          custom_keywords?: string[]
          description?: string
          face_checked_at?: string | null
          face_match_note?: string | null
          face_match_score?: number | null
          face_match_status?: string | null
          file_hash?: string | null
          file_path?: string | null
          final_credit?: number | null
          final_review_note?: string | null
          final_reviewer_id?: string | null
          form_file_path?: string | null
          id?: string
          item_category?: string | null
          item_project?: string | null
          keywords_fingerprint?: string | null
          level_name?: string | null
          review_source?: string | null
          reviewed_at?: string | null
          selected_keywords?: string[]
          self_rank?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          student_id?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_ai_matched_rule_id_fkey"
            columns: ["ai_matched_rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          affected_count: number
          created_at: string
          duration_ms: number | null
          failure_count: number
          id: string
          metadata: Json
          success_count: number
          target_ids: string[]
          target_labels: string[]
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          affected_count?: number
          created_at?: string
          duration_ms?: number | null
          failure_count?: number
          id?: string
          metadata?: Json
          success_count?: number
          target_ids?: string[]
          target_labels?: string[]
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          affected_count?: number
          created_at?: string
          duration_ms?: number | null
          failure_count?: number
          id?: string
          metadata?: Json
          success_count?: number
          target_ids?: string[]
          target_labels?: string[]
        }
        Relationships: []
      }
      cases: {
        Row: {
          awarded_credit: number | null
          college_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          rule_id: string | null
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          awarded_credit?: number | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          awarded_credit?: number | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          rule_id?: string | null
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_catalog: {
        Row: {
          active: boolean
          aliases: string[]
          cert_class: string
          college_id: string | null
          created_at: string
          created_by: string | null
          default_credit: number | null
          id: string
          issuer: string | null
          level: string | null
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          cert_class?: string
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          default_credit?: number | null
          id?: string
          issuer?: string | null
          level?: string | null
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliases?: string[]
          cert_class?: string
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          default_credit?: number | null
          id?: string
          issuer?: string | null
          level?: string | null
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_catalog_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_types: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          identity: string | null
          keywords: string[]
          last_synced_at: string
          level: string | null
          name: string
          occurrence_count: number
          source_case_ids: string[]
          source_rule_ids: string[]
          typical_credit: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          identity?: string | null
          keywords?: string[]
          last_synced_at?: string
          level?: string | null
          name: string
          occurrence_count?: number
          source_case_ids?: string[]
          source_rule_ids?: string[]
          typical_credit?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          identity?: string | null
          keywords?: string[]
          last_synced_at?: string
          level?: string | null
          name?: string
          occurrence_count?: number
          source_case_ids?: string[]
          source_rule_ids?: string[]
          typical_credit?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      colleges: {
        Row: {
          active: boolean
          badge_url: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          short_name: string | null
          system_title: string
          theme: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge_url?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          short_name?: string | null
          system_title?: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge_url?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          short_name?: string | null
          system_title?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: []
      }
      competition_catalog: {
        Row: {
          active: boolean
          aliases: string[]
          category: string
          college_id: string | null
          created_at: string
          created_by: string | null
          default_credit: number | null
          default_level: string | null
          id: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          category?: string
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          default_credit?: number | null
          default_level?: string | null
          id?: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliases?: string[]
          category?: string
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          default_credit?: number | null
          default_level?: string | null
          id?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_catalog_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          active: boolean
          category: string | null
          college_id: string | null
          created_at: string
          created_by: string | null
          id: string
          keyword: string
          source: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          active?: boolean
          category?: string | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keyword: string
          source?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          active?: boolean
          category?: string | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          keyword?: string
          source?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "keywords_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          advisor: string | null
          apartment_no: string | null
          bed_no: string | null
          birth_date: string | null
          class_name: string | null
          college_id: string | null
          created_at: string
          department: string | null
          dorm_room: string | null
          email: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          enrollment_year: number | null
          ethnicity: string | null
          full_name: string | null
          gender: string | null
          id: string
          id_card: string | null
          major: string | null
          phone: string | null
          photo_url: string | null
          political_status: string | null
          school: string | null
          student_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          advisor?: string | null
          apartment_no?: string | null
          bed_no?: string | null
          birth_date?: string | null
          class_name?: string | null
          college_id?: string | null
          created_at?: string
          department?: string | null
          dorm_room?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          enrollment_year?: number | null
          ethnicity?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          id_card?: string | null
          major?: string | null
          phone?: string | null
          photo_url?: string | null
          political_status?: string | null
          school?: string | null
          student_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          advisor?: string | null
          apartment_no?: string | null
          bed_no?: string | null
          birth_date?: string | null
          class_name?: string | null
          college_id?: string | null
          created_at?: string
          department?: string | null
          dorm_room?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          enrollment_year?: number | null
          ethnicity?: string | null
          full_name?: string | null
          gender?: string | null
          id?: string
          id_card?: string | null
          major?: string | null
          phone?: string | null
          photo_url?: string | null
          political_status?: string | null
          school?: string | null
          student_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_library: {
        Row: {
          active: boolean
          content: string
          created_at: string
          created_by: string | null
          id: string
          rule_no: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          rule_no?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          rule_no?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          achievement: string | null
          active: boolean
          category: string | null
          college_id: string | null
          created_at: string
          created_by: string | null
          credit: number
          description: string | null
          id: string
          identity: string | null
          keywords: string[]
          level: string | null
          name: string
          project: string | null
          updated_at: string
        }
        Insert: {
          achievement?: string | null
          active?: boolean
          category?: string | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          description?: string | null
          id?: string
          identity?: string | null
          keywords?: string[]
          level?: string | null
          name: string
          project?: string | null
          updated_at?: string
        }
        Update: {
          achievement?: string | null
          active?: boolean
          category?: string | null
          college_id?: string | null
          created_at?: string
          created_by?: string | null
          credit?: number
          description?: string | null
          id?: string
          identity?: string | null
          keywords?: string[]
          level?: string | null
          name?: string
          project?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rules_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_records: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          ai_confidence: number | null
          ai_decision: string | null
          ai_matched_rule_id: string | null
          ai_reasoning: string | null
          ai_suggested_credit: number | null
          application_id: string
          created_at: string
          description_snapshot: string | null
          event_type: Database["public"]["Enums"]["submission_event_type"]
          file_path: string | null
          id: string
          keywords_snapshot: string[] | null
          matched_rule_id: string | null
          review_credit: number | null
          review_decision: string | null
          review_note: string | null
          status_snapshot: string | null
          student_id: string
          student_name: string | null
          student_no: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          ai_confidence?: number | null
          ai_decision?: string | null
          ai_matched_rule_id?: string | null
          ai_reasoning?: string | null
          ai_suggested_credit?: number | null
          application_id: string
          created_at?: string
          description_snapshot?: string | null
          event_type: Database["public"]["Enums"]["submission_event_type"]
          file_path?: string | null
          id?: string
          keywords_snapshot?: string[] | null
          matched_rule_id?: string | null
          review_credit?: number | null
          review_decision?: string | null
          review_note?: string | null
          status_snapshot?: string | null
          student_id: string
          student_name?: string | null
          student_no?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          ai_confidence?: number | null
          ai_decision?: string | null
          ai_matched_rule_id?: string | null
          ai_reasoning?: string | null
          ai_suggested_credit?: number | null
          application_id?: string
          created_at?: string
          description_snapshot?: string | null
          event_type?: Database["public"]["Enums"]["submission_event_type"]
          file_path?: string | null
          id?: string
          keywords_snapshot?: string[] | null
          matched_rule_id?: string | null
          review_credit?: number | null
          review_decision?: string | null
          review_note?: string | null
          status_snapshot?: string | null
          student_id?: string
          student_name?: string | null
          student_no?: string | null
        }
        Relationships: []
      }
      submission_window_reports: {
        Row: {
          college_id: string
          file_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          summary: Json
          window_id: string
        }
        Insert: {
          college_id: string
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          summary?: Json
          window_id: string
        }
        Update: {
          college_id?: string
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          summary?: Json
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_window_reports_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "submission_windows"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_windows: {
        Row: {
          active: boolean
          college_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          name: string
          report_generated_at: string | null
          report_path: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          college_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          name: string
          report_generated_at?: string | null
          report_path?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          college_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          name?: string
          report_generated_at?: string | null
          report_path?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          college_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          college_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          college_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_college_id_fkey"
            columns: ["college_id"]
            isOneToOne: false
            referencedRelation: "colleges"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      submission_summary: {
        Row: {
          ai_confidence: number | null
          ai_matched_rule_id: string | null
          ai_reasoning: string | null
          ai_suggested_credit: number | null
          application_id: string | null
          class_name: string | null
          custom_keywords: string[] | null
          department: string | null
          description: string | null
          file_path: string | null
          final_credit: number | null
          final_review_note: string | null
          final_reviewer_id: string | null
          reviewed_at: string | null
          reviewer_name: string | null
          selected_keywords: string[] | null
          status: string | null
          student_id: string | null
          student_name: string | null
          student_no: string | null
          submitted_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_ai_matched_rule_id_fkey"
            columns: ["ai_matched_rule_id"]
            isOneToOne: false
            referencedRelation: "rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ai_decrypt_provider_key: {
        Args: { _provider_id: string; _secret: string }
        Returns: string
      }
      ai_encrypt_api_key: {
        Args: { _plain: string; _secret: string }
        Returns: {
          encrypted: string
          last4: string
        }[]
      }
      can_manage_college_badge_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      claim_ai_eval_jobs: {
        Args: { _limit?: number }
        Returns: {
          application_id: string
          attempts: number
          id: string
        }[]
      }
      claim_aigc_jobs: {
        Args: { _limit?: number }
        Returns: {
          application_id: string
          attempts: number
          id: string
        }[]
      }
      clone_template_to_college: {
        Args: { _college: string }
        Returns: undefined
      }
      current_open_window: {
        Args: { _college: string }
        Returns: {
          ends_at: string
          id: string
          name: string
          starts_at: string
        }[]
      }
      current_user_college_id: { Args: never; Returns: string }
      dashboard_stats: {
        Args: { _college?: string; _pass_threshold?: number }
        Returns: Json
      }
      dedupe_keywords: {
        Args: never
        Returns: {
          deleted_count: number
          merged_count: number
        }[]
      }
      gen_certificate_no: { Args: { _app_id: string }; Returns: string }
      get_student_credit_ranking: {
        Args: never
        Returns: {
          approved_count: number
          class_name: string
          college_id: string
          department: string
          full_name: string
          major: string
          rank: number
          student_no: string
          total_credit: number
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_submission_open: { Args: { _college: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_ai_eval_done: { Args: { _id: string }; Returns: undefined }
      mark_ai_eval_failed: {
        Args: { _error: string; _id: string }
        Returns: undefined
      }
      mark_aigc_done: { Args: { _id: string }; Returns: undefined }
      mark_aigc_failed: {
        Args: { _error: string; _id: string }
        Returns: undefined
      }
      normalize_college_name: { Args: { s: string }; Returns: string }
      normalize_keyword: { Args: { s: string }; Returns: string }
      refresh_certificate_types: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      strip_time_tokens: { Args: { s: string }; Returns: string }
      submit_application: {
        Args: { _app: Json; _attachments: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "super_admin"
      application_status:
        | "pending_ai"
        | "auto_approved"
        | "pending_review"
        | "rejected_by_ai"
        | "approved"
        | "rejected"
      review_action: "ai_evaluation" | "teacher_review" | "admin_review"
      submission_event_type:
        | "submitted"
        | "ai_reviewed"
        | "manual_reviewed"
        | "resubmitted"
        | "withdrawn"
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
    Enums: {
      app_role: ["admin", "teacher", "student", "super_admin"],
      application_status: [
        "pending_ai",
        "auto_approved",
        "pending_review",
        "rejected_by_ai",
        "approved",
        "rejected",
      ],
      review_action: ["ai_evaluation", "teacher_review", "admin_review"],
      submission_event_type: [
        "submitted",
        "ai_reviewed",
        "manual_reviewed",
        "resubmitted",
        "withdrawn",
      ],
    },
  },
} as const
