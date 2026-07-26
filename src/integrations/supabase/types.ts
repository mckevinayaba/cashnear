export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: Json | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: Json | null;
        };
        Relationships: [];
      };
      customer_profiles: {
        Row: {
          consent_accepted_at: string | null;
          created_at: string;
          full_legal_name: string | null;
          id_document_number: string | null;
          id_document_path: string | null;
          id_document_type: string | null;
          mobile_number: string | null;
          notes: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          saved_suburb: string | null;
          selfie_path: string | null;
          submitted_at: string | null;
          updated_at: string;
          user_id: string;
          verification_status: Database["public"]["Enums"]["verification_status"];
        };
        Insert: {
          consent_accepted_at?: string | null;
          created_at?: string;
          full_legal_name?: string | null;
          id_document_number?: string | null;
          id_document_path?: string | null;
          id_document_type?: string | null;
          mobile_number?: string | null;
          notes?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          saved_suburb?: string | null;
          selfie_path?: string | null;
          submitted_at?: string | null;
          updated_at?: string;
          user_id: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Update: {
          consent_accepted_at?: string | null;
          created_at?: string;
          full_legal_name?: string | null;
          id_document_number?: string | null;
          id_document_path?: string | null;
          id_document_type?: string | null;
          mobile_number?: string | null;
          notes?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          saved_suburb?: string | null;
          selfie_path?: string | null;
          submitted_at?: string | null;
          updated_at?: string;
          user_id?: string;
          verification_status?: Database["public"]["Enums"]["verification_status"];
        };
        Relationships: [];
      };
      operator_businesses: {
        Row: {
          agreements_accepted_at: string | null;
          application_status: Database["public"]["Enums"]["operator_application_status"];
          business_type: string | null;
          city: string | null;
          created_at: string;
          description: string | null;
          estimated_mdr: number | null;
          gps_lat: number | null;
          gps_lng: number | null;
          id: string;
          legal_name: string | null;
          max_transaction_amount: number | null;
          opening_hours: Json | null;
          owner_id: string;
          postal_code: string | null;
          premises_type: string | null;
          province: Database["public"]["Enums"]["sa_province"] | null;
          registration_number: string | null;
          representative_email: string | null;
          representative_id_number: string | null;
          representative_mobile: string | null;
          representative_name: string | null;
          representative_relationship: string | null;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          street_address: string | null;
          submitted_at: string | null;
          suburb: string | null;
          tax_number: string | null;
          terminal_model: string | null;
          terminal_provider: Database["public"]["Enums"]["terminal_provider"] | null;
          trading_name: string | null;
          updated_at: string;
          years_operating: number | null;
        };
        Insert: {
          agreements_accepted_at?: string | null;
          application_status?: Database["public"]["Enums"]["operator_application_status"];
          business_type?: string | null;
          city?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_mdr?: number | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          legal_name?: string | null;
          max_transaction_amount?: number | null;
          opening_hours?: Json | null;
          owner_id: string;
          postal_code?: string | null;
          premises_type?: string | null;
          province?: Database["public"]["Enums"]["sa_province"] | null;
          registration_number?: string | null;
          representative_email?: string | null;
          representative_id_number?: string | null;
          representative_mobile?: string | null;
          representative_name?: string | null;
          representative_relationship?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          street_address?: string | null;
          submitted_at?: string | null;
          suburb?: string | null;
          tax_number?: string | null;
          terminal_model?: string | null;
          terminal_provider?: Database["public"]["Enums"]["terminal_provider"] | null;
          trading_name?: string | null;
          updated_at?: string;
          years_operating?: number | null;
        };
        Update: {
          agreements_accepted_at?: string | null;
          application_status?: Database["public"]["Enums"]["operator_application_status"];
          business_type?: string | null;
          city?: string | null;
          created_at?: string;
          description?: string | null;
          estimated_mdr?: number | null;
          gps_lat?: number | null;
          gps_lng?: number | null;
          id?: string;
          legal_name?: string | null;
          max_transaction_amount?: number | null;
          opening_hours?: Json | null;
          owner_id?: string;
          postal_code?: string | null;
          premises_type?: string | null;
          province?: Database["public"]["Enums"]["sa_province"] | null;
          registration_number?: string | null;
          representative_email?: string | null;
          representative_id_number?: string | null;
          representative_mobile?: string | null;
          representative_name?: string | null;
          representative_relationship?: string | null;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          street_address?: string | null;
          submitted_at?: string | null;
          suburb?: string | null;
          tax_number?: string | null;
          terminal_model?: string | null;
          terminal_provider?: Database["public"]["Enums"]["terminal_provider"] | null;
          trading_name?: string | null;
          updated_at?: string;
          years_operating?: number | null;
        };
        Relationships: [];
      };
      operator_documents: {
        Row: {
          business_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          id: string;
          mime_type: string | null;
          notes: string | null;
          original_filename: string | null;
          size_bytes: number | null;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string;
        };
        Insert: {
          business_id: string;
          doc_type: Database["public"]["Enums"]["document_type"];
          id?: string;
          mime_type?: string | null;
          notes?: string | null;
          original_filename?: string | null;
          size_bytes?: number | null;
          storage_path: string;
          uploaded_at?: string;
          uploaded_by: string;
        };
        Update: {
          business_id?: string;
          doc_type?: Database["public"]["Enums"]["document_type"];
          id?: string;
          mime_type?: string | null;
          notes?: string | null;
          original_filename?: string | null;
          size_bytes?: number | null;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operator_documents_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "operator_businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      operator_staff: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "operator_staff_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "operator_businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      pilot_configuration: {
        Row: {
          description: string | null;
          id: string;
          key: string;
          updated_at: string;
          updated_by: string | null;
          value: Json;
        };
        Insert: {
          description?: string | null;
          id?: string;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
        };
        Update: {
          description?: string | null;
          id?: string;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          mobile: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          mobile?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          mobile?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      verification_reviews: {
        Row: {
          business_id: string;
          created_at: string;
          decision_note: string | null;
          from_status: Database["public"]["Enums"]["operator_application_status"] | null;
          id: string;
          reviewer_id: string;
          to_status: Database["public"]["Enums"]["operator_application_status"];
        };
        Insert: {
          business_id: string;
          created_at?: string;
          decision_note?: string | null;
          from_status?: Database["public"]["Enums"]["operator_application_status"] | null;
          id?: string;
          reviewer_id: string;
          to_status: Database["public"]["Enums"]["operator_application_status"];
        };
        Update: {
          business_id?: string;
          created_at?: string;
          decision_note?: string | null;
          from_status?: Database["public"]["Enums"]["operator_application_status"] | null;
          id?: string;
          reviewer_id?: string;
          to_status?: Database["public"]["Enums"]["operator_application_status"];
        };
        Relationships: [
          {
            foreignKeyName: "verification_reviews_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "operator_businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_business_member: {
        Args: { _business_id: string; _user_id: string };
        Returns: boolean;
      };
      log_audit_event: {
        Args: {
          p_action: string;
          p_entity_id?: string | null;
          p_entity_type: string;
          p_metadata?: Json | null;
        };
        Returns: Database["public"]["Tables"]["audit_logs"]["Row"];
      };
    };
    Enums: {
      app_role:
        | "customer"
        | "operator_owner"
        | "operator_manager"
        | "operator_cashier"
        | "ops_admin"
        | "super_admin";
      document_type:
        | "id_document"
        | "business_registration"
        | "proof_of_address"
        | "bank_confirmation"
        | "terminal_proof"
        | "premises_photo"
        | "signage_photo"
        | "other";
      operator_application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "info_requested"
        | "site_verification_required"
        | "approved"
        | "rejected"
        | "suspended"
        | "deactivated";
      sa_province:
        | "gauteng"
        | "western_cape"
        | "kwazulu_natal"
        | "eastern_cape"
        | "free_state"
        | "limpopo"
        | "mpumalanga"
        | "north_west"
        | "northern_cape";
      terminal_provider:
        | "yoco"
        | "ikhokha"
        | "fnb"
        | "standard_bank"
        | "nedbank"
        | "absa"
        | "kazang"
        | "flash"
        | "other";
      verification_status: "unverified" | "pending" | "approved" | "rejected" | "suspended";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

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
      document_type: [
        "id_document",
        "business_registration",
        "proof_of_address",
        "bank_confirmation",
        "terminal_proof",
        "premises_photo",
        "signage_photo",
        "other",
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
      verification_status: ["unverified", "pending", "approved", "rejected", "suspended"],
    },
  },
} as const;
