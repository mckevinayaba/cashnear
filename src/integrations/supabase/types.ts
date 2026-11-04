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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      cash_fee_schedule: {
        Row: {
          cashnear_fee_cents: number
          effective_from: string
          id: string
          max_cents: number
          min_cents: number
          partner_fee_cents: number
          rail_id: string
        }
        Insert: {
          cashnear_fee_cents?: number
          effective_from?: string
          id?: string
          max_cents: number
          min_cents: number
          partner_fee_cents: number
          rail_id: string
        }
        Update: {
          cashnear_fee_cents?: number
          effective_from?: string
          id?: string
          max_cents?: number
          min_cents?: number
          partner_fee_cents?: number
          rail_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_fee_schedule_rail_id_fkey"
            columns: ["rail_id"]
            isOneToOne: false
            referencedRelation: "cash_rails"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_incidents: {
        Row: {
          business_id: string
          created_at: string
          details: string
          id: string
          kind: string
          reporter_id: string | null
          request_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          sla_due: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          details?: string
          id?: string
          kind: string
          reporter_id?: string | null
          request_id: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          sla_due: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          details?: string
          id?: string
          kind?: string
          reporter_id?: string | null
          request_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          sla_due?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_incidents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_incidents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "cash_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_points: {
        Row: {
          area: string | null
          business_id: string
          cash_band_cents: number
          enrolled: boolean
          landmark: string | null
          latitude: number | null
          longitude: number | null
          missed_count: number
          online: boolean
          online_until: string | null
          paused_reason: string | null
          photo_path: string | null
          small_notes: boolean
          trust_score: number
          updated_at: string
        }
        Insert: {
          area?: string | null
          business_id: string
          cash_band_cents?: number
          enrolled?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          missed_count?: number
          online?: boolean
          online_until?: string | null
          paused_reason?: string | null
          photo_path?: string | null
          small_notes?: boolean
          trust_score?: number
          updated_at?: string
        }
        Update: {
          area?: string | null
          business_id?: string
          cash_band_cents?: number
          enrolled?: boolean
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          missed_count?: number
          online?: boolean
          online_until?: string | null
          paused_reason?: string | null
          photo_path?: string | null
          small_notes?: boolean
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_points_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_rails: {
        Row: {
          active: boolean
          created_at: string
          fee_verified: boolean
          id: string
          label: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fee_verified?: boolean
          id: string
          label: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fee_verified?: boolean
          id?: string
          label?: string
        }
        Relationships: []
      }
      cash_request_secrets: {
        Row: {
          code: string
          request_id: string
        }
        Insert: {
          code: string
          request_id: string
        }
        Update: {
          code?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_request_secrets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "cash_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_requests: {
        Row: {
          accept_by: string
          amount_cents: number
          business_id: string
          cashnear_fee_cents: number
          closed_reason: string | null
          code_attempts: number
          code_locked_until: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          distance_m: number | null
          expires_at: string | null
          handshake: string
          held_at: string | null
          id: string
          idempotency_key: string
          partner_fee_cents: number
          rail_id: string
          rating: number | null
          shop_completed_at: string | null
          shop_reference: string | null
          small_notes: boolean
          status: Database["public"]["Enums"]["cash_request_status"]
        }
        Insert: {
          accept_by: string
          amount_cents: number
          business_id: string
          cashnear_fee_cents?: number
          closed_reason?: string | null
          code_attempts?: number
          code_locked_until?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          distance_m?: number | null
          expires_at?: string | null
          handshake: string
          held_at?: string | null
          id?: string
          idempotency_key: string
          partner_fee_cents: number
          rail_id: string
          rating?: number | null
          shop_completed_at?: string | null
          shop_reference?: string | null
          small_notes?: boolean
          status?: Database["public"]["Enums"]["cash_request_status"]
        }
        Update: {
          accept_by?: string
          amount_cents?: number
          business_id?: string
          cashnear_fee_cents?: number
          closed_reason?: string | null
          code_attempts?: number
          code_locked_until?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          distance_m?: number | null
          expires_at?: string | null
          handshake?: string
          held_at?: string | null
          id?: string
          idempotency_key?: string
          partner_fee_cents?: number
          rail_id?: string
          rating?: number | null
          shop_completed_at?: string | null
          shop_reference?: string | null
          small_notes?: boolean
          status?: Database["public"]["Enums"]["cash_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_requests_rail_id_fkey"
            columns: ["rail_id"]
            isOneToOne: false
            referencedRelation: "cash_rails"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          consent_accepted_at: string | null
          created_at: string
          full_legal_name: string | null
          id_document_number: string | null
          id_document_path: string | null
          id_document_type: string | null
          mobile_number: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          saved_suburb: string | null
          selfie_path: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          consent_accepted_at?: string | null
          created_at?: string
          full_legal_name?: string | null
          id_document_number?: string | null
          id_document_path?: string | null
          id_document_type?: string | null
          mobile_number?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          saved_suburb?: string | null
          selfie_path?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          consent_accepted_at?: string | null
          created_at?: string
          full_legal_name?: string | null
          id_document_number?: string | null
          id_document_path?: string | null
          id_document_type?: string | null
          mobile_number?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          saved_suburb?: string | null
          selfie_path?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      operator_businesses: {
        Row: {
          agreements_accepted_at: string | null
          application_status: Database["public"]["Enums"]["operator_application_status"]
          business_structure:
            | Database["public"]["Enums"]["business_structure_type"]
            | null
          business_type: string | null
          city: string | null
          created_at: string
          description: string | null
          estimated_mdr: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          legal_name: string | null
          max_transaction_amount: number | null
          opening_hours: Json | null
          owner_id: string
          postal_code: string | null
          premises_type: string | null
          province: Database["public"]["Enums"]["sa_province"] | null
          registration_number: string | null
          representative_email: string | null
          representative_id_country: string | null
          representative_id_expiry: string | null
          representative_id_number: string | null
          representative_id_type:
            | Database["public"]["Enums"]["identity_document_type"]
            | null
          representative_immigration_status_expiry: string | null
          representative_immigration_status_number: string | null
          representative_immigration_status_type: string | null
          representative_mobile: string | null
          representative_name: string | null
          representative_relationship: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          street_address: string | null
          submitted_at: string | null
          suburb: string | null
          tax_number: string | null
          terminal_model: string | null
          terminal_provider:
            | Database["public"]["Enums"]["terminal_provider"]
            | null
          trading_name: string | null
          updated_at: string
          years_operating: number | null
        }
        Insert: {
          agreements_accepted_at?: string | null
          application_status?: Database["public"]["Enums"]["operator_application_status"]
          business_structure?:
            | Database["public"]["Enums"]["business_structure_type"]
            | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_mdr?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          legal_name?: string | null
          max_transaction_amount?: number | null
          opening_hours?: Json | null
          owner_id: string
          postal_code?: string | null
          premises_type?: string | null
          province?: Database["public"]["Enums"]["sa_province"] | null
          registration_number?: string | null
          representative_email?: string | null
          representative_id_country?: string | null
          representative_id_expiry?: string | null
          representative_id_number?: string | null
          representative_id_type?:
            | Database["public"]["Enums"]["identity_document_type"]
            | null
          representative_immigration_status_expiry?: string | null
          representative_immigration_status_number?: string | null
          representative_immigration_status_type?: string | null
          representative_mobile?: string | null
          representative_name?: string | null
          representative_relationship?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          street_address?: string | null
          submitted_at?: string | null
          suburb?: string | null
          tax_number?: string | null
          terminal_model?: string | null
          terminal_provider?:
            | Database["public"]["Enums"]["terminal_provider"]
            | null
          trading_name?: string | null
          updated_at?: string
          years_operating?: number | null
        }
        Update: {
          agreements_accepted_at?: string | null
          application_status?: Database["public"]["Enums"]["operator_application_status"]
          business_structure?:
            | Database["public"]["Enums"]["business_structure_type"]
            | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          description?: string | null
          estimated_mdr?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          legal_name?: string | null
          max_transaction_amount?: number | null
          opening_hours?: Json | null
          owner_id?: string
          postal_code?: string | null
          premises_type?: string | null
          province?: Database["public"]["Enums"]["sa_province"] | null
          registration_number?: string | null
          representative_email?: string | null
          representative_id_country?: string | null
          representative_id_expiry?: string | null
          representative_id_number?: string | null
          representative_id_type?:
            | Database["public"]["Enums"]["identity_document_type"]
            | null
          representative_immigration_status_expiry?: string | null
          representative_immigration_status_number?: string | null
          representative_immigration_status_type?: string | null
          representative_mobile?: string | null
          representative_name?: string | null
          representative_relationship?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          street_address?: string | null
          submitted_at?: string | null
          suburb?: string | null
          tax_number?: string | null
          terminal_model?: string | null
          terminal_provider?:
            | Database["public"]["Enums"]["terminal_provider"]
            | null
          trading_name?: string | null
          updated_at?: string
          years_operating?: number | null
        }
        Relationships: []
      }
      operator_documents: {
        Row: {
          business_id: string
          doc_type: Database["public"]["Enums"]["document_type"]
          id: string
          mime_type: string | null
          notes: string | null
          original_filename: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          business_id: string
          doc_type: Database["public"]["Enums"]["document_type"]
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          business_id?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_documents_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_staff: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operator_staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_configuration: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          mobile: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          mobile?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          identifier?: string
        }
        Relationships: []
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
      verification_reviews: {
        Row: {
          business_id: string
          created_at: string
          decision_note: string | null
          from_status:
            | Database["public"]["Enums"]["operator_application_status"]
            | null
          id: string
          reviewer_id: string
          to_status: Database["public"]["Enums"]["operator_application_status"]
        }
        Insert: {
          business_id: string
          created_at?: string
          decision_note?: string | null
          from_status?:
            | Database["public"]["Enums"]["operator_application_status"]
            | null
          id?: string
          reviewer_id: string
          to_status: Database["public"]["Enums"]["operator_application_status"]
        }
        Update: {
          business_id?: string
          created_at?: string
          decision_note?: string | null
          from_status?:
            | Database["public"]["Enums"]["operator_application_status"]
            | null
          id?: string
          reviewer_id?: string
          to_status?: Database["public"]["Enums"]["operator_application_status"]
        }
        Relationships: [
          {
            foreignKeyName: "verification_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "operator_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cash_admin_requests: {
        Args: {
          p_export?: boolean
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      cash_admin_shops: { Args: { p_days?: number }; Returns: Json }
      cash_admin_summary: { Args: { p_days?: number }; Returns: Json }
      cash_cfg: { Args: { p_default: number; p_key: string }; Returns: number }
      cash_clear_pause: {
        Args: { p_business: string; p_note: string }
        Returns: undefined
      }
      cash_create_request: {
        Args: {
          p_amount_cents: number
          p_business: string
          p_distance_m?: number
          p_idem: string
          p_rail: string
          p_small: boolean
        }
        Returns: Json
      }
      cash_customer_cap_cents: { Args: { p_user: string }; Returns: number }
      cash_distance_m: {
        Args: { a_lat: number; a_lng: number; b_lat: number; b_lng: number }
        Returns: number
      }
      cash_enrol_point: {
        Args: {
          p_area: string
          p_business: string
          p_enrolled: boolean
          p_lat: number
          p_lng: number
        }
        Returns: {
          area: string | null
          business_id: string
          cash_band_cents: number
          enrolled: boolean
          landmark: string | null
          latitude: number | null
          longitude: number | null
          missed_count: number
          online: boolean
          online_until: string | null
          paused_reason: string | null
          photo_path: string | null
          small_notes: boolean
          trust_score: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_points"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cash_get_request: { Args: { p_id: string }; Returns: Json }
      cash_my_active: { Args: never; Returns: Json }
      cash_my_history: { Args: { p_limit?: number }; Returns: Json }
      cash_nearby: {
        Args: {
          p_amount_cents: number
          p_lat: number
          p_lng: number
          p_rail: string
          p_small?: boolean
        }
        Returns: {
          business_id: string
          can_serve: boolean
          distance_m: number
          landmark: string
          name: string
          photo_path: string
          suburb: string
          walk_min: number
        }[]
      }
      cash_quote: {
        Args: { p_amount_cents: number; p_rail: string }
        Returns: Json
      }
      cash_reserved_cents: { Args: { p_business: string }; Returns: number }
      cash_resolve_incident: {
        Args: { p_incident: string; p_resolution: string }
        Returns: undefined
      }
      cash_set_availability: {
        Args: {
          p_band_cents?: number
          p_business: string
          p_minutes?: number
          p_small?: boolean
        }
        Returns: Json
      }
      cash_set_rail_active: {
        Args: { p_active: boolean; p_fee_verified?: boolean; p_rail: string }
        Returns: undefined
      }
      cash_set_shopfront: {
        Args: { p_business: string; p_landmark: string; p_photo_path: string }
        Returns: {
          area: string | null
          business_id: string
          cash_band_cents: number
          enrolled: boolean
          landmark: string | null
          latitude: number | null
          longitude: number | null
          missed_count: number
          online: boolean
          online_until: string | null
          paused_reason: string | null
          photo_path: string | null
          small_notes: boolean
          trust_score: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_points"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cash_shape: {
        Args: {
          p_viewer: string
          r: Database["public"]["Tables"]["cash_requests"]["Row"]
        }
        Returns: Json
      }
      cash_shop_state: { Args: { p_business: string }; Returns: Json }
      cash_sweep: { Args: never; Returns: undefined }
      cash_transition: {
        Args: { p_action: string; p_id: string; p_payload?: Json }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_max_attempts: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_business_member: {
        Args: { _business_id: string; _user_id: string }
        Returns: boolean
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "customer"
        | "operator_owner"
        | "operator_manager"
        | "operator_cashier"
        | "ops_admin"
        | "super_admin"
      business_structure_type:
        | "sole_trader"
        | "registered_company"
        | "close_corporation"
        | "partnership"
        | "cooperative"
        | "other"
      cash_request_status:
        | "awaiting_shop"
        | "held"
        | "awaiting_confirmation"
        | "completed"
        | "declined"
        | "expired"
        | "cancelled"
        | "disputed"
        | "needs_review"
      document_type:
        | "id_document"
        | "business_registration"
        | "proof_of_address"
        | "bank_confirmation"
        | "terminal_proof"
        | "premises_photo"
        | "signage_photo"
        | "other"
        | "immigration_status"
        | "passport_supporting"
      identity_document_type:
        | "sa_id"
        | "passport"
        | "asylum_permit"
        | "refugee_permit"
        | "permanent_residence_permit"
      operator_application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "info_requested"
        | "site_verification_required"
        | "approved"
        | "rejected"
        | "suspended"
        | "deactivated"
      sa_province:
        | "gauteng"
        | "western_cape"
        | "kwazulu_natal"
        | "eastern_cape"
        | "free_state"
        | "limpopo"
        | "mpumalanga"
        | "north_west"
        | "northern_cape"
      terminal_provider:
        | "yoco"
        | "ikhokha"
        | "fnb"
        | "standard_bank"
        | "nedbank"
        | "absa"
        | "kazang"
        | "flash"
        | "other"
      verification_status:
        | "unverified"
        | "pending"
        | "approved"
        | "rejected"
        | "suspended"
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
      app_role: [
        "customer",
        "operator_owner",
        "operator_manager",
        "operator_cashier",
        "ops_admin",
        "super_admin",
      ],
      business_structure_type: [
        "sole_trader",
        "registered_company",
        "close_corporation",
        "partnership",
        "cooperative",
        "other",
      ],
      cash_request_status: [
        "awaiting_shop",
        "held",
        "awaiting_confirmation",
        "completed",
        "declined",
        "expired",
        "cancelled",
        "disputed",
        "needs_review",
      ],
      document_type: [
        "id_document",
        "business_registration",
        "proof_of_address",
        "bank_confirmation",
        "terminal_proof",
        "premises_photo",
        "signage_photo",
        "other",
        "immigration_status",
        "passport_supporting",
      ],
      identity_document_type: [
        "sa_id",
        "passport",
        "asylum_permit",
        "refugee_permit",
        "permanent_residence_permit",
      ],
      operator_application_status: [
        "draft",
        "submitted",
        "under_review",
        "info_requested",
        "site_verification_required",
        "approved",
        "rejected",
        "suspended",
        "deactivated",
      ],
      sa_province: [
        "gauteng",
        "western_cape",
        "kwazulu_natal",
        "eastern_cape",
        "free_state",
        "limpopo",
        "mpumalanga",
        "north_west",
        "northern_cape",
      ],
      terminal_provider: [
        "yoco",
        "ikhokha",
        "fnb",
        "standard_bank",
        "nedbank",
        "absa",
        "kazang",
        "flash",
        "other",
      ],
      verification_status: [
        "unverified",
        "pending",
        "approved",
        "rejected",
        "suspended",
      ],
    },
  },
} as const
