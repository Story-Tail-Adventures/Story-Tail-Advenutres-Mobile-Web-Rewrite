export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account: {
        Row: {
          archived_at: string | null
          auth_provider: Database["public"]["Enums"]["auth_provider"]
          auth_provider_id: string | null
          created_at: string
          email: string
          email_verified_at: string | null
          id: string
          last_login_at: string | null
          locked_at: string | null
          locked_reason: string | null
          mfa_enrolled_at: string | null
          mfa_required: boolean
          password_hash: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          auth_provider: Database["public"]["Enums"]["auth_provider"]
          auth_provider_id?: string | null
          created_at?: string
          email: string
          email_verified_at?: string | null
          id: string
          last_login_at?: string | null
          locked_at?: string | null
          locked_reason?: string | null
          mfa_enrolled_at?: string | null
          mfa_required?: boolean
          password_hash?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          auth_provider?: Database["public"]["Enums"]["auth_provider"]
          auth_provider_id?: string | null
          created_at?: string
          email?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          locked_at?: string | null
          locked_reason?: string | null
          mfa_enrolled_at?: string | null
          mfa_required?: boolean
          password_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      address: {
        Row: {
          city: string
          country: string
          created_at: string
          id: string
          line1: string
          line2: string | null
          postal_code: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          id: string
          line1: string
          line2?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          line1?: string
          line2?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent: {
        Row: {
          avatar_url: string | null
          bio: string | null
          commission_split_pct: number | null
          created_at: string
          display_name: string
          email: string
          email_signature: string | null
          id: string
          phone: string | null
          pronouns: string | null
          social_links: Json
          status: Database["public"]["Enums"]["agent_status"]
          time_zone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          commission_split_pct?: number | null
          created_at?: string
          display_name: string
          email: string
          email_signature?: string | null
          id: string
          phone?: string | null
          pronouns?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["agent_status"]
          time_zone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          commission_split_pct?: number | null
          created_at?: string
          display_name?: string
          email?: string
          email_signature?: string | null
          id?: string
          phone?: string | null
          pronouns?: string | null
          social_links?: Json
          status?: Database["public"]["Enums"]["agent_status"]
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_alert_email: {
        Row: {
          agent_id: string
          attempts: number
          claimed_at: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          sent_at: string | null
          state: string
          trip_id: string | null
        }
        Insert: {
          agent_id: string
          attempts?: number
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          sent_at?: string | null
          state?: string
          trip_id?: string | null
        }
        Update: {
          agent_id?: string
          attempts?: number
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          sent_at?: string | null
          state?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_alert_email_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_alert_email_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_alert_email_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_auto_reply: {
        Row: {
          conversation_id: string
          created_at: string
          message_id: string
          time_off_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          message_id: string
          time_off_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          message_id?: string
          time_off_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_auto_reply_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_auto_reply_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_auto_reply_time_off_id_fkey"
            columns: ["time_off_id"]
            isOneToOne: false
            referencedRelation: "agent_time_off"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_availability: {
        Row: {
          agent_id: string
          calendar_sync_provider: string | null
          calendar_sync_refresh_token_encrypted: string | null
          response_time_hours: number
          time_off_blocks: Json
          updated_at: string
          weekly_schedule: Json
        }
        Insert: {
          agent_id: string
          calendar_sync_provider?: string | null
          calendar_sync_refresh_token_encrypted?: string | null
          response_time_hours?: number
          time_off_blocks?: Json
          updated_at?: string
          weekly_schedule?: Json
        }
        Update: {
          agent_id?: string
          calendar_sync_provider?: string | null
          calendar_sync_refresh_token_encrypted?: string | null
          response_time_hours?: number
          time_off_blocks?: Json
          updated_at?: string
          weekly_schedule?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agent_availability_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_time_off: {
        Row: {
          agent_id: string
          auto_reply_enabled: boolean
          auto_reply_text: string | null
          created_at: string
          ends_on: string
          id: string
          label: string | null
          starts_on: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          auto_reply_enabled?: boolean
          auto_reply_text?: string | null
          created_at?: string
          ends_on: string
          id: string
          label?: string | null
          starts_on: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          auto_reply_enabled?: boolean
          auto_reply_text?: string | null
          created_at?: string
          ends_on?: string
          id?: string
          label?: string | null
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_time_off_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_event: {
        Row: {
          actor_role: Database["public"]["Enums"]["user_role"] | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json
          target_entity: string | null
          target_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id: string
          ip_address?: unknown
          metadata?: Json
          target_entity?: string | null
          target_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["user_role"] | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          target_entity?: string | null
          target_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_event_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_event: {
        Row: {
          account_id: string | null
          created_at: string
          email_attempted: string | null
          event_type: Database["public"]["Enums"]["auth_event_type"]
          failure_reason: string | null
          id: string
          ip_address: unknown
          result: string
          user_agent: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          email_attempted?: string | null
          event_type: Database["public"]["Enums"]["auth_event_type"]
          failure_reason?: string | null
          id: string
          ip_address?: unknown
          result: string
          user_agent?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          email_attempted?: string | null
          event_type?: Database["public"]["Enums"]["auth_event_type"]
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          result?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auth_event_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_event_flag: {
        Row: {
          auth_event_id: string
          created_at: string
          flagged_by_agent_id: string
        }
        Insert: {
          auth_event_id: string
          created_at?: string
          flagged_by_agent_id: string
        }
        Update: {
          auth_event_id?: string
          created_at?: string
          flagged_by_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_event_flag_auth_event_id_fkey"
            columns: ["auth_event_id"]
            isOneToOne: true
            referencedRelation: "auth_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auth_event_flag_flagged_by_agent_id_fkey"
            columns: ["flagged_by_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
      client: {
        Row: {
          agent_id: string
          archived_at: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact: Json | null
          first_name: string
          id: string
          important_dates: Json
          last_name: string
          mailing_address_id: string | null
          merged_into_client_id: string | null
          notes: string | null
          phone: string | null
          preferred_name: string | null
          status: Database["public"]["Enums"]["client_status"]
          tags: string[]
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          archived_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name: string
          id: string
          important_dates?: Json
          last_name: string
          mailing_address_id?: string | null
          merged_into_client_id?: string | null
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact?: Json | null
          first_name?: string
          id?: string
          important_dates?: Json
          last_name?: string
          mailing_address_id?: string | null
          merged_into_client_id?: string | null
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_mailing_address_id_fkey"
            columns: ["mailing_address_id"]
            isOneToOne: false
            referencedRelation: "address"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_merged_into_client_id_fkey"
            columns: ["merged_into_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invite: {
        Row: {
          accepted_account_id: string | null
          accepted_at: string | null
          client_id: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          issued_by_user_id: string
          revoked_at: string | null
        }
        Insert: {
          accepted_account_id?: string | null
          accepted_at?: string | null
          client_id: string
          code_hash: string
          created_at?: string
          expires_at: string
          id: string
          issued_by_user_id: string
          revoked_at?: string | null
        }
        Update: {
          accepted_account_id?: string | null
          accepted_at?: string | null
          client_id?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          issued_by_user_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_invite_accepted_account_id_fkey"
            columns: ["accepted_account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invite_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_invite_issued_by_user_id_fkey"
            columns: ["issued_by_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      client_note: {
        Row: {
          archived_at: string | null
          author_user_id: string
          body: string
          client_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          author_user_id: string
          body: string
          client_id: string
          created_at?: string
          id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          author_user_id?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_note_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_note_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      commission: {
        Row: {
          agent_id: string
          archived_at: string | null
          commission_pct: number
          component_id: string | null
          created_at: string
          currency: string
          expected_commission_cents: number
          gross_booking_cents: number
          id: string
          import_id: string | null
          inteletravel_reference: string | null
          notes: string | null
          on_record_at: string | null
          payment_lag_days: number
          payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          processing_fee_cents: number
          received_at: string | null
          received_commission_cents: number
          status: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          trip_id: string
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          archived_at?: string | null
          commission_pct: number
          component_id?: string | null
          created_at?: string
          currency: string
          expected_commission_cents: number
          gross_booking_cents: number
          id: string
          import_id?: string | null
          inteletravel_reference?: string | null
          notes?: string | null
          on_record_at?: string | null
          payment_lag_days?: number
          payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          processing_fee_cents?: number
          received_at?: string | null
          received_commission_cents?: number
          status?: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          trip_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          commission_pct?: number
          component_id?: string | null
          created_at?: string
          currency?: string
          expected_commission_cents?: number
          gross_booking_cents?: number
          id?: string
          import_id?: string | null
          inteletravel_reference?: string | null
          notes?: string | null
          on_record_at?: string | null
          payment_lag_days?: number
          payment_terms?: Database["public"]["Enums"]["commission_payment_terms"]
          processing_fee_cents?: number
          received_at?: string | null
          received_commission_cents?: number
          status?: Database["public"]["Enums"]["commission_status"]
          supplier_id?: string
          trip_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "trip_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "commission_import"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_import: {
        Row: {
          agent_id: string
          checksum_sha256: string
          column_map: Json
          created_at: string
          document_id: string
          headers: string[]
          id: string
          imported_by_user_id: string
          matched_rows: number
          original_filename: string
          period_end: string | null
          period_start: string | null
          reconciled_at: string | null
          source: string
          statement_date: string | null
          status: Database["public"]["Enums"]["commission_import_status"]
          total_rows: number
          unmatched_rows: number
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          checksum_sha256: string
          column_map?: Json
          created_at?: string
          document_id: string
          headers?: string[]
          id: string
          imported_by_user_id: string
          matched_rows?: number
          original_filename: string
          period_end?: string | null
          period_start?: string | null
          reconciled_at?: string | null
          source?: string
          statement_date?: string | null
          status?: Database["public"]["Enums"]["commission_import_status"]
          total_rows?: number
          unmatched_rows?: number
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          checksum_sha256?: string
          column_map?: Json
          created_at?: string
          document_id?: string
          headers?: string[]
          id?: string
          imported_by_user_id?: string
          matched_rows?: number
          original_filename?: string
          period_end?: string | null
          period_start?: string | null
          reconciled_at?: string | null
          source?: string
          statement_date?: string | null
          status?: Database["public"]["Enums"]["commission_import_status"]
          total_rows?: number
          unmatched_rows?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_import_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_document_fk"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_imported_by_user_id_fkey"
            columns: ["imported_by_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_import_row: {
        Row: {
          cells: string[]
          commission_id: string | null
          created_at: string
          currency: string
          fee_cents: number | null
          gross_cents: number | null
          id: string
          import_id: string
          match_basis: Database["public"]["Enums"]["commission_match_basis"]
          new_commission_id: string | null
          new_commission_pct: number | null
          new_gross_cents: number | null
          new_supplier_id: string | null
          new_trip_id: string | null
          paid_on: string | null
          parse_error: string | null
          received_cents: number | null
          reference: string | null
          row_number: number
          state: Database["public"]["Enums"]["commission_import_row_state"]
          suggested_commission_id: string | null
          supplier_text: string | null
          traveler_text: string | null
          updated_at: string
        }
        Insert: {
          cells: string[]
          commission_id?: string | null
          created_at?: string
          currency?: string
          fee_cents?: number | null
          gross_cents?: number | null
          id: string
          import_id: string
          match_basis?: Database["public"]["Enums"]["commission_match_basis"]
          new_commission_id?: string | null
          new_commission_pct?: number | null
          new_gross_cents?: number | null
          new_supplier_id?: string | null
          new_trip_id?: string | null
          paid_on?: string | null
          parse_error?: string | null
          received_cents?: number | null
          reference?: string | null
          row_number: number
          state?: Database["public"]["Enums"]["commission_import_row_state"]
          suggested_commission_id?: string | null
          supplier_text?: string | null
          traveler_text?: string | null
          updated_at?: string
        }
        Update: {
          cells?: string[]
          commission_id?: string | null
          created_at?: string
          currency?: string
          fee_cents?: number | null
          gross_cents?: number | null
          id?: string
          import_id?: string
          match_basis?: Database["public"]["Enums"]["commission_match_basis"]
          new_commission_id?: string | null
          new_commission_pct?: number | null
          new_gross_cents?: number | null
          new_supplier_id?: string | null
          new_trip_id?: string | null
          paid_on?: string | null
          parse_error?: string | null
          received_cents?: number | null
          reference?: string | null
          row_number?: number
          state?: Database["public"]["Enums"]["commission_import_row_state"]
          suggested_commission_id?: string | null
          supplier_text?: string | null
          traveler_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_import_row_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_row_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "commission_import"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_row_new_supplier_id_fkey"
            columns: ["new_supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_row_new_trip_id_fkey"
            columns: ["new_trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_import_row_suggested_commission_id_fkey"
            columns: ["suggested_commission_id"]
            isOneToOne: false
            referencedRelation: "commission"
            referencedColumns: ["id"]
          },
        ]
      }
      companion: {
        Row: {
          archived_at: string | null
          client_id: string
          created_at: string
          date_of_birth: string | null
          first_name: string
          frequent_flyer_numbers: Json
          id: string
          is_invited_to_platform: boolean
          last_name: string
          linked_client_id: string | null
          passport_country: string | null
          passport_expiry: string | null
          passport_number_encrypted: string | null
          relationship: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          frequent_flyer_numbers?: Json
          id: string
          is_invited_to_platform?: boolean
          last_name: string
          linked_client_id?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number_encrypted?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          frequent_flyer_numbers?: Json
          id?: string
          is_invited_to_platform?: boolean
          last_name?: string
          linked_client_id?: string | null
          passport_country?: string | null
          passport_expiry?: string | null
          passport_number_encrypted?: string | null
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_linked_client_id_fkey"
            columns: ["linked_client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation: {
        Row: {
          agent_archived_at: string | null
          agent_id: string
          agent_unread_count: number
          archived_at: string | null
          client_id: string
          client_unread_count: number
          created_at: string
          id: string
          last_message_at: string
          last_message_preview: string | null
          subject: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          agent_archived_at?: string | null
          agent_id: string
          agent_unread_count?: number
          archived_at?: string | null
          client_id: string
          client_unread_count?: number
          created_at?: string
          id: string
          last_message_at?: string
          last_message_preview?: string | null
          subject?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_archived_at?: string | null
          agent_id?: string
          agent_unread_count?: number
          archived_at?: string | null
          client_id?: string
          client_unread_count?: number
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          subject?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_api_request: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: Database["public"]["Enums"]["cruise_sync_endpoint"]
          error_code: string | null
          error_detail: string | null
          id: string
          path: string
          provider: string
          provider_request_id: string | null
          query: Json
          quota_limit: number | null
          quota_remaining: number | null
          quota_reset_seconds: number | null
          rows_returned: number | null
          run_id: string | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: Database["public"]["Enums"]["cruise_sync_endpoint"]
          error_code?: string | null
          error_detail?: string | null
          id: string
          path: string
          provider?: string
          provider_request_id?: string | null
          query?: Json
          quota_limit?: number | null
          quota_remaining?: number | null
          quota_reset_seconds?: number | null
          rows_returned?: number | null
          run_id?: string | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: Database["public"]["Enums"]["cruise_sync_endpoint"]
          error_code?: string | null
          error_detail?: string | null
          id?: string
          path?: string
          provider?: string
          provider_request_id?: string | null
          query?: Json
          quota_limit?: number | null
          quota_remaining?: number | null
          quota_reset_seconds?: number | null
          rows_returned?: number | null
          run_id?: string | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cruise_api_request_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "cruise_sync_run"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_line: {
        Row: {
          archived_at: string | null
          created_at: string
          destination_count: number | null
          destinations: string[]
          display_order: number
          earliest_departure: string | null
          first_seen_at: string
          id: string
          is_booked: boolean
          last_seen_at: string | null
          latest_departure: string | null
          locales: string[]
          name: string
          provider: string | null
          provider_key: string | null
          provider_payload: Json | null
          provider_updated_at: string | null
          sailing_count: number | null
          ship_count: number | null
          slug: string
          supplier_id: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          destination_count?: number | null
          destinations?: string[]
          display_order?: number
          earliest_departure?: string | null
          first_seen_at?: string
          id: string
          is_booked?: boolean
          last_seen_at?: string | null
          latest_departure?: string | null
          locales?: string[]
          name: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          ship_count?: number | null
          slug: string
          supplier_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          destination_count?: number | null
          destinations?: string[]
          display_order?: number
          earliest_departure?: string | null
          first_seen_at?: string
          id?: string
          is_booked?: boolean
          last_seen_at?: string | null
          latest_departure?: string | null
          locales?: string[]
          name?: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          ship_count?: number | null
          slug?: string
          supplier_id?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruise_line_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_port: {
        Row: {
          archived_at: string | null
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string | null
          latitude: number | null
          longitude: number | null
          name: string
          provider: string | null
          provider_key: string | null
          provider_payload: Json | null
          provider_updated_at: string | null
          sailing_count: number | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          first_seen_at?: string
          id: string
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cruise_port_call: {
        Row: {
          arrival_at: string | null
          created_at: string
          day: number | null
          departure_at: string | null
          id: string
          port_id: string | null
          port_name: string
          sailing_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          arrival_at?: string | null
          created_at?: string
          day?: number | null
          departure_at?: string | null
          id: string
          port_id?: string | null
          port_name: string
          sailing_id: string
          sequence: number
          updated_at?: string
        }
        Update: {
          arrival_at?: string | null
          created_at?: string
          day?: number | null
          departure_at?: string | null
          id?: string
          port_id?: string | null
          port_name?: string
          sailing_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruise_port_call_port_id_fkey"
            columns: ["port_id"]
            isOneToOne: false
            referencedRelation: "cruise_port"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cruise_port_call_sailing_id_fkey"
            columns: ["sailing_id"]
            isOneToOne: false
            referencedRelation: "cruise_sailing"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_sailing: {
        Row: {
          archived_at: string | null
          created_at: string
          cruise_line_id: string
          currency: string | null
          departure_date: string
          destinations: string[]
          duration_nights: number | null
          first_seen_at: string
          id: string
          itinerary_url: string | null
          last_seen_at: string | null
          lead_price_cents: number | null
          lead_price_eur_cents: number | null
          provider: string
          provider_key: string
          provider_locale: string
          provider_payload: Json | null
          provider_updated_at: string | null
          ship_id: string | null
          synced_at: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          cruise_line_id: string
          currency?: string | null
          departure_date: string
          destinations?: string[]
          duration_nights?: number | null
          first_seen_at?: string
          id: string
          itinerary_url?: string | null
          last_seen_at?: string | null
          lead_price_cents?: number | null
          lead_price_eur_cents?: number | null
          provider: string
          provider_key: string
          provider_locale: string
          provider_payload?: Json | null
          provider_updated_at?: string | null
          ship_id?: string | null
          synced_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          cruise_line_id?: string
          currency?: string | null
          departure_date?: string
          destinations?: string[]
          duration_nights?: number | null
          first_seen_at?: string
          id?: string
          itinerary_url?: string | null
          last_seen_at?: string | null
          lead_price_cents?: number | null
          lead_price_eur_cents?: number | null
          provider?: string
          provider_key?: string
          provider_locale?: string
          provider_payload?: Json | null
          provider_updated_at?: string | null
          ship_id?: string | null
          synced_at?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruise_sailing_cruise_line_id_fkey"
            columns: ["cruise_line_id"]
            isOneToOne: false
            referencedRelation: "cruise_line"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cruise_sailing_ship_id_fkey"
            columns: ["ship_id"]
            isOneToOne: false
            referencedRelation: "cruise_ship"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_sailing_cabin_price: {
        Row: {
          cabin_code: string
          created_at: string
          currency: string
          id: string
          price_cents: number
          provider_locale: string
          sailing_id: string
          updated_at: string
        }
        Insert: {
          cabin_code: string
          created_at?: string
          currency: string
          id: string
          price_cents: number
          provider_locale: string
          sailing_id: string
          updated_at?: string
        }
        Update: {
          cabin_code?: string
          created_at?: string
          currency?: string
          id?: string
          price_cents?: number
          provider_locale?: string
          sailing_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruise_sailing_cabin_price_sailing_id_fkey"
            columns: ["sailing_id"]
            isOneToOne: false
            referencedRelation: "cruise_sailing"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_ship: {
        Row: {
          archived_at: string | null
          created_at: string
          cruise_line_id: string
          earliest_departure: string | null
          first_seen_at: string
          id: string
          image_credit: string | null
          image_license: string | null
          image_source_url: string | null
          image_url: string | null
          last_seen_at: string | null
          latest_departure: string | null
          name: string
          provider: string | null
          provider_key: string | null
          provider_payload: Json | null
          provider_updated_at: string | null
          sailing_count: number | null
          slug: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          cruise_line_id: string
          earliest_departure?: string | null
          first_seen_at?: string
          id: string
          image_credit?: string | null
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          last_seen_at?: string | null
          latest_departure?: string | null
          name: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          slug?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          cruise_line_id?: string
          earliest_departure?: string | null
          first_seen_at?: string
          id?: string
          image_credit?: string | null
          image_license?: string | null
          image_source_url?: string | null
          image_url?: string | null
          last_seen_at?: string | null
          latest_departure?: string | null
          name?: string
          provider?: string | null
          provider_key?: string | null
          provider_payload?: Json | null
          provider_updated_at?: string | null
          sailing_count?: number | null
          slug?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cruise_ship_cruise_line_id_fkey"
            columns: ["cruise_line_id"]
            isOneToOne: false
            referencedRelation: "cruise_line"
            referencedColumns: ["id"]
          },
        ]
      }
      cruise_sync_dispatch: {
        Row: {
          dispatched_at: string
          request_id: number
        }
        Insert: {
          dispatched_at?: string
          request_id: number
        }
        Update: {
          dispatched_at?: string
          request_id?: number
        }
        Relationships: []
      }
      cruise_sync_run: {
        Row: {
          created_at: string
          error_code: string | null
          error_detail: string | null
          finished_at: string | null
          id: string
          quota_limit: number | null
          quota_remaining: number | null
          quota_reset_seconds: number | null
          requests_spent: number
          rows_archived: number
          rows_upserted: number
          scopes_run: number
          started_at: string
          status: Database["public"]["Enums"]["cruise_sync_status"]
          trigger: Database["public"]["Enums"]["cruise_sync_trigger"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id: string
          quota_limit?: number | null
          quota_remaining?: number | null
          quota_reset_seconds?: number | null
          requests_spent?: number
          rows_archived?: number
          rows_upserted?: number
          scopes_run?: number
          started_at?: string
          status?: Database["public"]["Enums"]["cruise_sync_status"]
          trigger: Database["public"]["Enums"]["cruise_sync_trigger"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_detail?: string | null
          finished_at?: string | null
          id?: string
          quota_limit?: number | null
          quota_remaining?: number | null
          quota_reset_seconds?: number | null
          requests_spent?: number
          rows_archived?: number
          rows_upserted?: number
          scopes_run?: number
          started_at?: string
          status?: Database["public"]["Enums"]["cruise_sync_status"]
          trigger?: Database["public"]["Enums"]["cruise_sync_trigger"]
          updated_at?: string
        }
        Relationships: []
      }
      cruise_sync_scope: {
        Row: {
          company: string | null
          created_at: string
          cursor: string | null
          cursor_set_at: string | null
          departure_offset_days: number
          departure_within_days: number | null
          destination: string | null
          enabled: boolean
          endpoint: Database["public"]["Enums"]["cruise_sync_endpoint"]
          high_water_updated_at: string | null
          id: string
          label: string
          last_error: string | null
          last_run_at: string | null
          last_status: Database["public"]["Enums"]["cruise_sync_status"] | null
          locale: string | null
          max_requests_per_run: number
          max_rows_per_request: number
          min_interval_days: number
          priority: number
          sort: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          cursor?: string | null
          cursor_set_at?: string | null
          departure_offset_days?: number
          departure_within_days?: number | null
          destination?: string | null
          enabled?: boolean
          endpoint: Database["public"]["Enums"]["cruise_sync_endpoint"]
          high_water_updated_at?: string | null
          id: string
          label: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: Database["public"]["Enums"]["cruise_sync_status"] | null
          locale?: string | null
          max_requests_per_run?: number
          max_rows_per_request?: number
          min_interval_days?: number
          priority?: number
          sort?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          cursor?: string | null
          cursor_set_at?: string | null
          departure_offset_days?: number
          departure_within_days?: number | null
          destination?: string | null
          enabled?: boolean
          endpoint?: Database["public"]["Enums"]["cruise_sync_endpoint"]
          high_water_updated_at?: string | null
          id?: string
          label?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: Database["public"]["Enums"]["cruise_sync_status"] | null
          locale?: string | null
          max_requests_per_run?: number
          max_rows_per_request?: number
          min_interval_days?: number
          priority?: number
          sort?: string
          updated_at?: string
        }
        Relationships: []
      }
      document: {
        Row: {
          archived_at: string | null
          checksum_sha256: string
          client_id: string | null
          created_at: string
          filename: string
          id: string
          is_sensitive: boolean
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          owner_user_id: string
          size_bytes: number
          storage_bucket: string
          storage_key: string
          trip_id: string | null
        }
        Insert: {
          archived_at?: string | null
          checksum_sha256: string
          client_id?: string | null
          created_at?: string
          filename: string
          id: string
          is_sensitive?: boolean
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          owner_user_id: string
          size_bytes: number
          storage_bucket: string
          storage_key: string
          trip_id?: string | null
        }
        Update: {
          archived_at?: string | null
          checksum_sha256?: string
          client_id?: string | null
          created_at?: string
          filename?: string
          id?: string
          is_sensitive?: boolean
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string
          owner_user_id?: string
          size_bytes?: number
          storage_bucket?: string
          storage_key?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          client_user_id: string
          conversation_id: string
          created_at: string
          due_at: string
          first_message_at: string
          id: string
          last_error: string | null
          latest_message_id: string
          sent_at: string | null
          skip_reason: string | null
          state: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          client_user_id: string
          conversation_id: string
          created_at?: string
          due_at: string
          first_message_at: string
          id?: string
          last_error?: string | null
          latest_message_id: string
          sent_at?: string | null
          skip_reason?: string | null
          state?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          client_user_id?: string
          conversation_id?: string
          created_at?: string
          due_at?: string
          first_message_at?: string
          id?: string
          last_error?: string | null
          latest_message_id?: string
          sent_at?: string | null
          skip_reason?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_latest_message_id_fkey"
            columns: ["latest_message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
        ]
      }
      email_token: {
        Row: {
          client_user_id: string
          conversation_id: string
          created_at: string
          expires_at: string
          outbox_id: string | null
          purpose: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          client_user_id: string
          conversation_id: string
          created_at?: string
          expires_at: string
          outbox_id?: string | null
          purpose: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          client_user_id?: string
          conversation_id?: string
          created_at?: string
          expires_at?: string
          outbox_id?: string | null
          purpose?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_token_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_token_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_token_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          targeting: Json
          updated_at: string
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          targeting?: Json
          updated_at?: string
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          targeting?: Json
          updated_at?: string
        }
        Relationships: []
      }
      hotel_api_request: {
        Row: {
          cache_key: string | null
          created_at: string
          duration_ms: number | null
          endpoint: Database["public"]["Enums"]["hotel_search_endpoint"]
          error_code: string | null
          error_detail: string | null
          id: string
          path: string
          provider: string
          provider_search_id: string | null
          query: Json
          quota_hour_limit: number | null
          quota_limit: number | null
          quota_month_usage: number | null
          quota_observed_at: string | null
          quota_remaining: number | null
          quota_this_hour: number | null
          rows_returned: number | null
          status_code: number | null
        }
        Insert: {
          cache_key?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint: Database["public"]["Enums"]["hotel_search_endpoint"]
          error_code?: string | null
          error_detail?: string | null
          id: string
          path: string
          provider?: string
          provider_search_id?: string | null
          query?: Json
          quota_hour_limit?: number | null
          quota_limit?: number | null
          quota_month_usage?: number | null
          quota_observed_at?: string | null
          quota_remaining?: number | null
          quota_this_hour?: number | null
          rows_returned?: number | null
          status_code?: number | null
        }
        Update: {
          cache_key?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: Database["public"]["Enums"]["hotel_search_endpoint"]
          error_code?: string | null
          error_detail?: string | null
          id?: string
          path?: string
          provider?: string
          provider_search_id?: string | null
          query?: Json
          quota_hour_limit?: number | null
          quota_limit?: number | null
          quota_month_usage?: number | null
          quota_observed_at?: string | null
          quota_remaining?: number | null
          quota_this_hour?: number | null
          rows_returned?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      hotel_search_cache: {
        Row: {
          cache_key: string
          created_at: string
          currency: string
          expires_at: string
          fetched_at: string
          highest_rate_cents: number | null
          id: string
          lowest_rate_cents: number | null
          payload: Json
          payload_version: number
          provider: string
          query_fingerprint: Json
          result_count: number
        }
        Insert: {
          cache_key: string
          created_at?: string
          currency: string
          expires_at: string
          fetched_at?: string
          highest_rate_cents?: number | null
          id: string
          lowest_rate_cents?: number | null
          payload: Json
          payload_version: number
          provider?: string
          query_fingerprint: Json
          result_count: number
        }
        Update: {
          cache_key?: string
          created_at?: string
          currency?: string
          expires_at?: string
          fetched_at?: string
          highest_rate_cents?: number | null
          id?: string
          lowest_rate_cents?: number | null
          payload?: Json
          payload_version?: number
          provider?: string
          query_fingerprint?: Json
          result_count?: number
        }
        Relationships: []
      }
      hotel_search_config: {
        Row: {
          cache_grace_hours: number
          cache_ttl_seconds: number
          detail_retention_days: number
          enabled: boolean
          global_per_hour: number
          hourly_ceiling: number
          id: boolean
          monthly_ceiling: number
          rate_per_day: number
          rate_per_hour: number
          rate_per_minute: number
          updated_at: string
        }
        Insert: {
          cache_grace_hours?: number
          cache_ttl_seconds?: number
          detail_retention_days?: number
          enabled?: boolean
          global_per_hour?: number
          hourly_ceiling?: number
          id?: boolean
          monthly_ceiling?: number
          rate_per_day?: number
          rate_per_hour?: number
          rate_per_minute?: number
          updated_at?: string
        }
        Update: {
          cache_grace_hours?: number
          cache_ttl_seconds?: number
          detail_retention_days?: number
          enabled?: boolean
          global_per_hour?: number
          hourly_ceiling?: number
          id?: boolean
          monthly_ceiling?: number
          rate_per_day?: number
          rate_per_hour?: number
          rate_per_minute?: number
          updated_at?: string
        }
        Relationships: []
      }
      hotel_search_rate_bucket: {
        Row: {
          bucket_key: string
          created_at: string
          hits: number
          window_kind: Database["public"]["Enums"]["hotel_rate_window"]
          window_start: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          hits?: number
          window_kind: Database["public"]["Enums"]["hotel_rate_window"]
          window_start: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          hits?: number
          window_kind?: Database["public"]["Enums"]["hotel_rate_window"]
          window_start?: string
        }
        Relationships: []
      }
      inbound_email: {
        Row: {
          files_dropped: number
          id: string
          message_id: string | null
          outcome: string
          provider_email_id: string
          received_at: string
        }
        Insert: {
          files_dropped?: number
          id?: string
          message_id?: string | null
          outcome: string
          provider_email_id: string
          received_at?: string
        }
        Update: {
          files_dropped?: number
          id?: string
          message_id?: string | null
          outcome?: string
          provider_email_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary: {
        Row: {
          closing_note: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          intro_note: string | null
          last_published_at: string | null
          published_at: string | null
          trip_id: string
          updated_at: string
          version: number
        }
        Insert: {
          closing_note?: string | null
          cover_image_url?: string | null
          created_at?: string
          id: string
          intro_note?: string | null
          last_published_at?: string | null
          published_at?: string | null
          trip_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          closing_note?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          intro_note?: string | null
          last_published_at?: string | null
          published_at?: string | null
          trip_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_activity: {
        Row: {
          address: string | null
          block: Database["public"]["Enums"]["block_kind"]
          body: string | null
          component_id: string | null
          confirmation_number: string | null
          created_at: string
          end_time: string | null
          gyasis_tip: string | null
          id: string
          itinerary_day_id: string
          location: string | null
          order_index: number
          phone: string | null
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          block: Database["public"]["Enums"]["block_kind"]
          body?: string | null
          component_id?: string | null
          confirmation_number?: string | null
          created_at?: string
          end_time?: string | null
          gyasis_tip?: string | null
          id: string
          itinerary_day_id: string
          location?: string | null
          order_index?: number
          phone?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          block?: Database["public"]["Enums"]["block_kind"]
          body?: string | null
          component_id?: string | null
          confirmation_number?: string | null
          created_at?: string
          end_time?: string | null
          gyasis_tip?: string | null
          id?: string
          itinerary_day_id?: string
          location?: string | null
          order_index?: number
          phone?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_activity_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "trip_component"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_activity_itinerary_day_id_fkey"
            columns: ["itinerary_day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_day"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_day: {
        Row: {
          date: string
          day_number: number
          id: string
          itinerary_id: string
          label: string | null
          summary: string | null
          weather_forecast: Json | null
        }
        Insert: {
          date: string
          day_number: number
          id: string
          itinerary_id: string
          label?: string | null
          summary?: string | null
          weather_forecast?: Json | null
        }
        Update: {
          date?: string
          day_number?: number
          id?: string
          itinerary_id?: string
          label?: string | null
          summary?: string | null
          weather_forecast?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_day_itinerary_id_fkey"
            columns: ["itinerary_id"]
            isOneToOne: false
            referencedRelation: "itinerary"
            referencedColumns: ["id"]
          },
        ]
      }
      message: {
        Row: {
          archived_at: string | null
          body: string
          channel: string
          conversation_id: string
          created_at: string
          emailed_at: string | null
          id: string
          is_auto_reply: boolean
          is_internal_note: boolean
          read_by_other_at: string | null
          sender_role: Database["public"]["Enums"]["user_role"]
          sender_user_id: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          channel?: string
          conversation_id: string
          created_at?: string
          emailed_at?: string | null
          id: string
          is_auto_reply?: boolean
          is_internal_note?: boolean
          read_by_other_at?: string | null
          sender_role: Database["public"]["Enums"]["user_role"]
          sender_user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          channel?: string
          conversation_id?: string
          created_at?: string
          emailed_at?: string | null
          id?: string
          is_auto_reply?: boolean
          is_internal_note?: boolean
          read_by_other_at?: string | null
          sender_role?: Database["public"]["Enums"]["user_role"]
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachment: {
        Row: {
          created_at: string
          document_id: string
          id: string
          message_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id: string
          message_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachment_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachment_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
        ]
      }
      message_template: {
        Row: {
          agent_id: string
          archived_at: string | null
          body_markdown: string
          category: string
          created_at: string
          id: string
          name: string
          subject: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          agent_id: string
          archived_at?: string | null
          body_markdown: string
          category: string
          created_at?: string
          id: string
          name: string
          subject?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          body_markdown?: string
          category?: string
          created_at?: string
          id?: string
          name?: string
          subject?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_template_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_device: {
        Row: {
          account_id: string
          enrolled_at: string
          id: string
          is_primary: boolean
          kind: Database["public"]["Enums"]["mfa_kind"]
          label: string
          last_used_at: string | null
          revoked_at: string | null
          secret_encrypted: string | null
        }
        Insert: {
          account_id: string
          enrolled_at?: string
          id: string
          is_primary?: boolean
          kind: Database["public"]["Enums"]["mfa_kind"]
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          secret_encrypted?: string | null
        }
        Update: {
          account_id?: string
          enrolled_at?: string
          id?: string
          is_primary?: boolean
          kind?: Database["public"]["Enums"]["mfa_kind"]
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          secret_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_device_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preference: {
        Row: {
          channels: Json
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channels?: Json
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channels?: Json
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preference_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestone: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          due_date: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_milestone_kind"]
          label: string
          order_index: number
          paid_at: string | null
          paid_cents: number
          paid_note: string | null
          paid_reference: string | null
          pay_url: string | null
          status: Database["public"]["Enums"]["payment_milestone_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_milestone_kind"]
          label: string
          order_index?: number
          paid_at?: string | null
          paid_cents?: number
          paid_note?: string | null
          paid_reference?: string | null
          pay_url?: string | null
          status?: Database["public"]["Enums"]["payment_milestone_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_milestone_kind"]
          label?: string
          order_index?: number
          paid_at?: string | null
          paid_cents?: number
          paid_note?: string | null
          paid_reference?: string | null
          pay_url?: string | null
          status?: Database["public"]["Enums"]["payment_milestone_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestone_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_weight: {
        Row: {
          agent_id: string
          status: Database["public"]["Enums"]["trip_status"]
          updated_at: string
          weight_pct: number
        }
        Insert: {
          agent_id: string
          status: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
          weight_pct: number
        }
        Update: {
          agent_id?: string
          status?: Database["public"]["Enums"]["trip_status"]
          updated_at?: string
          weight_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_weight_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_user: {
        Row: {
          account_id: string
          agent_id: string | null
          avatar_url: string | null
          client_id: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          onboarding_completed_at: string | null
          onboarding_step: string | null
          role: Database["public"]["Enums"]["user_role"]
          time_zone: string
          updated_at: string
        }
        Insert: {
          account_id: string
          agent_id?: string | null
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          display_name: string
          id: string
          locale?: string
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          role: Database["public"]["Enums"]["user_role"]
          time_zone?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          agent_id?: string | null
          avatar_url?: string | null
          client_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
          onboarding_completed_at?: string | null
          onboarding_step?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          time_zone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_user_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_user_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_user_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal: {
        Row: {
          accepted_at: string | null
          closing_note: string | null
          cover_image_url: string | null
          cover_title: string
          created_at: string
          id: string
          opening_note: string | null
          pricing_valid_until: string | null
          sent_at: string | null
          snapshot: Json
          trip_id: string
          updated_at: string
          version_number: number
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          closing_note?: string | null
          cover_image_url?: string | null
          cover_title: string
          created_at?: string
          id: string
          opening_note?: string | null
          pricing_valid_until?: string | null
          sent_at?: string | null
          snapshot: Json
          trip_id: string
          updated_at?: string
          version_number: number
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          closing_note?: string | null
          cover_image_url?: string | null
          cover_title?: string
          created_at?: string
          id?: string
          opening_note?: string | null
          pricing_valid_until?: string | null
          sent_at?: string | null
          snapshot?: Json
          trip_id?: string
          updated_at?: string
          version_number?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      push_device: {
        Row: {
          created_at: string
          fcm_token: string | null
          id: string
          label: string | null
          last_seen_at: string
          platform: Database["public"]["Enums"]["push_platform"]
          platform_user_id: string
          web_auth: string | null
          web_endpoint: string | null
          web_p256dh: string | null
        }
        Insert: {
          created_at?: string
          fcm_token?: string | null
          id: string
          label?: string | null
          last_seen_at?: string
          platform: Database["public"]["Enums"]["push_platform"]
          platform_user_id: string
          web_auth?: string | null
          web_endpoint?: string | null
          web_p256dh?: string | null
        }
        Update: {
          created_at?: string
          fcm_token?: string | null
          id?: string
          label?: string | null
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["push_platform"]
          platform_user_id?: string
          web_auth?: string | null
          web_endpoint?: string | null
          web_p256dh?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_device_platform_user_id_fkey"
            columns: ["platform_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
        ]
      }
      push_outbox: {
        Row: {
          agent_id: string
          attempts: number
          claimed_at: string | null
          conversation_id: string | null
          created_at: string
          due_at: string
          held: boolean
          hold_reason: string | null
          id: string
          kind: string
          latest_message_id: string | null
          message_count: number
          needs_dismiss: boolean
          sent_at: string | null
          state: string
          trip_id: string | null
        }
        Insert: {
          agent_id: string
          attempts?: number
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at: string
          held: boolean
          hold_reason?: string | null
          id?: string
          kind?: string
          latest_message_id?: string | null
          message_count: number
          needs_dismiss?: boolean
          sent_at?: string | null
          state?: string
          trip_id?: string | null
        }
        Update: {
          agent_id?: string
          attempts?: number
          claimed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          due_at?: string
          held?: boolean
          hold_reason?: string | null
          id?: string
          kind?: string
          latest_message_id?: string | null
          message_count?: number
          needs_dismiss?: boolean
          sent_at?: string | null
          state?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_latest_message_id_fkey"
            columns: ["latest_message_id"]
            isOneToOne: false
            referencedRelation: "message"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_outbox_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      session: {
        Row: {
          account_id: string
          device_label: string
          expires_at: string
          id: string
          ip_address: unknown
          ip_country: string | null
          last_active_at: string
          revoked_at: string | null
          started_at: string
          user_agent: string
        }
        Insert: {
          account_id: string
          device_label: string
          expires_at: string
          id: string
          ip_address: unknown
          ip_country?: string | null
          last_active_at?: string
          revoked_at?: string | null
          started_at?: string
          user_agent: string
        }
        Update: {
          account_id?: string
          device_label?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          ip_country?: string | null
          last_active_at?: string
          revoked_at?: string | null
          started_at?: string
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier: {
        Row: {
          archived_at: string | null
          commission_payment_lag_days: number | null
          commission_payment_terms:
            | Database["public"]["Enums"]["commission_payment_terms"]
            | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          default_commission_pct: number | null
          id: string
          kind: Database["public"]["Enums"]["supplier_kind"]
          name: string
          notes: string | null
          payment_api_endpoint: string | null
          payment_method_kind: Database["public"]["Enums"]["supplier_payment_kind"]
          payment_portal_url: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          commission_payment_lag_days?: number | null
          commission_payment_terms?:
            | Database["public"]["Enums"]["commission_payment_terms"]
            | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_commission_pct?: number | null
          id: string
          kind: Database["public"]["Enums"]["supplier_kind"]
          name: string
          notes?: string | null
          payment_api_endpoint?: string | null
          payment_method_kind?: Database["public"]["Enums"]["supplier_payment_kind"]
          payment_portal_url?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          commission_payment_lag_days?: number | null
          commission_payment_terms?:
            | Database["public"]["Enums"]["commission_payment_terms"]
            | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          default_commission_pct?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["supplier_kind"]
          name?: string
          notes?: string | null
          payment_api_endpoint?: string | null
          payment_method_kind?: Database["public"]["Enums"]["supplier_payment_kind"]
          payment_portal_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      testimonial: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by_user_id: string | null
          attribution: string | null
          body: string
          client_id: string
          created_at: string
          id: string
          published_at: string | null
          rating: number | null
          status: Database["public"]["Enums"]["testimonial_status"]
          submitted_at: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          attribution?: string | null
          body: string
          client_id: string
          created_at?: string
          id: string
          published_at?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["testimonial_status"]
          submitted_at?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by_user_id?: string | null
          attribution?: string | null
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          published_at?: string | null
          rating?: number | null
          status?: Database["public"]["Enums"]["testimonial_status"]
          submitted_at?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "testimonial_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testimonial_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_document: {
        Row: {
          archived_at: string | null
          client_id: string
          companion_id: string | null
          created_at: string
          document_id: string | null
          document_number_encrypted: string | null
          expires_on: string | null
          id: string
          issued_on: string | null
          issuing_country: string | null
          kind: Database["public"]["Enums"]["travel_doc_kind"]
          notes: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          companion_id?: string | null
          created_at?: string
          document_id?: string | null
          document_number_encrypted?: string | null
          expires_on?: string | null
          id: string
          issued_on?: string | null
          issuing_country?: string | null
          kind: Database["public"]["Enums"]["travel_doc_kind"]
          notes?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          companion_id?: string | null
          created_at?: string
          document_id?: string | null
          document_number_encrypted?: string | null
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuing_country?: string | null
          kind?: Database["public"]["Enums"]["travel_doc_kind"]
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_document_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_document_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "companion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_document_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_preference: {
        Row: {
          accessibility_needs: string[]
          accessibility_notes: string | null
          budget_band: string | null
          client_id: string
          dietary_notes: string | null
          dietary_restrictions: string[]
          favorite_past_trips: string | null
          id: string
          loyalty_programs: Json
          preferred_destinations: string[]
          travel_styles: string[]
          updated_at: string
        }
        Insert: {
          accessibility_needs?: string[]
          accessibility_notes?: string | null
          budget_band?: string | null
          client_id: string
          dietary_notes?: string | null
          dietary_restrictions?: string[]
          favorite_past_trips?: string | null
          id: string
          loyalty_programs?: Json
          preferred_destinations?: string[]
          travel_styles?: string[]
          updated_at?: string
        }
        Update: {
          accessibility_needs?: string[]
          accessibility_notes?: string | null
          budget_band?: string | null
          client_id?: string
          dietary_notes?: string | null
          dietary_restrictions?: string[]
          favorite_past_trips?: string | null
          id?: string
          loyalty_programs?: Json
          preferred_destinations?: string[]
          travel_styles?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_preference_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
        ]
      }
      trip: {
        Row: {
          agent_id: string
          archived_at: string | null
          cancellation_reason: string | null
          client_id: string
          created_at: string
          currency: string
          destinations: string[]
          end_date: string | null
          id: string
          notes: string | null
          refund_detail: string | null
          refund_status: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          status_changed_at: string
          template_id: string | null
          title: string
          total_commission_cents: number
          total_paid_cents: number
          total_value_cents: number
          traveler_breakdown: Json | null
          traveler_count: number
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
          version: number
        }
        Insert: {
          agent_id: string
          archived_at?: string | null
          cancellation_reason?: string | null
          client_id: string
          created_at?: string
          currency?: string
          destinations?: string[]
          end_date?: string | null
          id: string
          notes?: string | null
          refund_detail?: string | null
          refund_status?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          status_changed_at?: string
          template_id?: string | null
          title: string
          total_commission_cents?: number
          total_paid_cents?: number
          total_value_cents?: number
          traveler_breakdown?: Json | null
          traveler_count?: number
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          cancellation_reason?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          destinations?: string[]
          end_date?: string | null
          id?: string
          notes?: string | null
          refund_detail?: string | null
          refund_status?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          status_changed_at?: string
          template_id?: string | null
          title?: string
          total_commission_cents?: number
          total_paid_cents?: number
          total_value_cents?: number
          traveler_breakdown?: Json | null
          traveler_count?: number
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "trip_template"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_component: {
        Row: {
          api_reference: string | null
          api_source: string | null
          archived_at: string | null
          commission_cents: number
          commission_pct: number | null
          confirmation_number: string | null
          cost_cents: number
          created_at: string
          currency: string
          display_name: string
          end_date: string | null
          end_time: string | null
          id: string
          kind: Database["public"]["Enums"]["component_kind"]
          location: string | null
          order_index: number
          payload: Json
          start_date: string | null
          start_time: string | null
          supplier_id: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          api_reference?: string | null
          api_source?: string | null
          archived_at?: string | null
          commission_cents?: number
          commission_pct?: number | null
          confirmation_number?: string | null
          cost_cents?: number
          created_at?: string
          currency?: string
          display_name: string
          end_date?: string | null
          end_time?: string | null
          id: string
          kind: Database["public"]["Enums"]["component_kind"]
          location?: string | null
          order_index?: number
          payload?: Json
          start_date?: string | null
          start_time?: string | null
          supplier_id?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          api_reference?: string | null
          api_source?: string | null
          archived_at?: string | null
          commission_cents?: number
          commission_pct?: number | null
          confirmation_number?: string | null
          cost_cents?: number
          created_at?: string
          currency?: string
          display_name?: string
          end_date?: string | null
          end_time?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["component_kind"]
          location?: string | null
          order_index?: number
          payload?: Json
          start_date?: string | null
          start_time?: string | null
          supplier_id?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_component_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_component_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_status_history: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          from_status: Database["public"]["Enums"]["trip_status"] | null
          id: string
          to_status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          id: string
          to_status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          from_status?: Database["public"]["Enums"]["trip_status"] | null
          id?: string
          to_status?: Database["public"]["Enums"]["trip_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_status_history_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_template: {
        Row: {
          agent_id: string
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          payload: Json
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
        }
        Insert: {
          agent_id: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id: string
          name: string
          payload?: Json
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
        }
        Update: {
          agent_id?: string
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          payload?: Json
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_template_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_admin_audit: {
        Args: {
          p_actor_user_id: string
          p_audit_id: string
          p_client_id: string
          p_event_type: string
          p_ip: string
          p_metadata: Json
          p_user_agent: string
        }
        Returns: undefined
      }
      account_admin_bind_invite: {
        Args: {
          p_account_id: string
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_client_id: string
          p_ip?: string
          p_user_agent?: string
        }
        Returns: string
      }
      account_admin_claim_signin_email: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_client_id: string
          p_ip?: string
          p_kind: string
          p_user_agent?: string
        }
        Returns: string
      }
      account_admin_lock_client: {
        Args: { p_agent_id: string; p_client_id: string }
        Returns: boolean
      }
      account_admin_merge_clients: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_choices: Json
          p_expect_lock_account: string
          p_ip?: string
          p_keep_id: string
          p_keep_version: number
          p_retire_id: string
          p_retire_version: number
          p_user_agent?: string
        }
        Returns: Json
      }
      account_admin_set_flag: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_auth_event_id: string
          p_client_id: string
          p_flag: boolean
          p_ip?: string
          p_user_agent?: string
        }
        Returns: string
      }
      account_admin_set_lock: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_client_id: string
          p_ip?: string
          p_lock: boolean
          p_reason: string
          p_user_agent?: string
        }
        Returns: Json
      }
      account_admin_sign_out_everywhere: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_client_id: string
          p_ip?: string
          p_user_agent?: string
        }
        Returns: number
      }
      account_admin_target: {
        Args: { p_agent_id: string; p_client_id: string }
        Returns: Json
      }
      agent_alert_default: {
        Args: { p_category: string; p_channel: string }
        Returns: boolean
      }
      agent_alert_email_claim: {
        Args: { p_limit?: number }
        Returns: {
          agent_first_name: string
          alert_id: string
          client_name: string
          conversation_id: string
          kind: string
          recipient: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_alert_email_finish: {
        Args: {
          p_alert_id: string
          p_error?: string
          p_ok: boolean
          p_permanent?: boolean
        }
        Returns: string
      }
      agent_alert_email_release: {
        Args: { p_alert_id: string }
        Returns: string
      }
      agent_alert_on: {
        Args: { p_agent_id: string; p_category: string; p_channel: string }
        Returns: boolean
      }
      agent_apply_template: {
        Args: { p_agent_id: string; p_template_id: string; p_trip_id: string }
        Returns: {
          activities_added: number
          components_added: number
          days_added: number
          outcome: string
        }[]
      }
      agent_archive_template: {
        Args: { p_agent_id: string; p_template_id: string }
        Returns: {
          outcome: string
        }[]
      }
      agent_archive_trip_component: {
        Args: { p_agent_id: string; p_component_id: string; p_trip_id: string }
        Returns: {
          component_id: string
          outcome: string
        }[]
      }
      agent_availability_self: {
        Args: never
        Returns: {
          agent_id: string
          calendar_sync_provider: string
          response_time_hours: number
          time_off_blocks: Json
          time_zone: string
          updated_at: string
          weekly_schedule: Json
        }[]
      }
      agent_bulk_set_trip_status: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_from_statuses: Database["public"]["Enums"]["trip_status"][]
          p_to_status: Database["public"]["Enums"]["trip_status"]
          p_trip_ids: string[]
        }
        Returns: {
          from_status: Database["public"]["Enums"]["trip_status"]
          trip_id: string
          version: number
        }[]
      }
      agent_bulk_tag_clients: {
        Args: {
          p_add: boolean
          p_agent_id: string
          p_client_ids: string[]
          p_tag: string
        }
        Returns: {
          client_id: string
          version: number
        }[]
      }
      agent_cancel_trip: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_ids?: string[]
          p_close_lines?: Json
          p_expected_version: number
          p_ip?: string
          p_reason: string
          p_refund_detail?: string
          p_refund_status?: string
          p_trip_id: string
          p_user_agent?: string
        }
        Returns: {
          from_status: Database["public"]["Enums"]["trip_status"]
          lines_closed: number
          lines_skipped: number
          outcome: string
          to_status: Database["public"]["Enums"]["trip_status"]
          version: number
        }[]
      }
      agent_client_account_admin: {
        Args: { p_client_id: string }
        Returns: Json
      }
      agent_client_activity: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: {
          actor_name: string
          actor_role: Database["public"]["Enums"]["user_role"]
          created_at: string
          event_id: string
          event_type: string
          metadata: Json
          target_entity: string
          target_id: string
        }[]
      }
      agent_client_companions: {
        Args: { p_client_id: string }
        Returns: {
          companion_id: string
          date_of_birth: string
          first_name: string
          invited: boolean
          last_name: string
          linked_client_id: string
          passport_country: string
          passport_expiry: string
          relationship: string
        }[]
      }
      agent_client_conversations: {
        Args: { p_client_id: string }
        Returns: {
          agent_unread_count: number
          conversation_id: string
          last_message_at: string
          last_message_preview: string
          message_count: number
          subject: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_client_documents: {
        Args: { p_client_id: string }
        Returns: {
          created_at: string
          document_id: string
          filename: string
          is_sensitive: boolean
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          size_bytes: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_client_merge_view: {
        Args: { p_client_id: string; p_other_id?: string; p_search?: string }
        Returns: Json
      }
      agent_client_notes: {
        Args: { p_client_id: string }
        Returns: {
          author_is_me: boolean
          author_name: string
          body: string
          created_at: string
          note_id: string
          updated_at: string
        }[]
      }
      agent_client_overview: {
        Args: { p_client_id: string }
        Returns: {
          accessibility_needs: string[]
          accessibility_notes: string
          active_trip_count: number
          address_city: string
          address_country: string
          address_line1: string
          address_line2: string
          address_postal_code: string
          address_region: string
          archived_at: string
          as_of_date: string
          budget_band: string
          client_id: string
          commission_cents: string
          created_at: string
          date_of_birth: string
          dietary_notes: string
          dietary_restrictions: string[]
          display_name: string
          document_count: number
          email: string
          emergency_contact: Json
          favorite_past_trips: string
          first_name: string
          important_dates: Json
          last_contact_at: string
          last_name: string
          lifetime_currency: string
          lifetime_value_cents: string
          loyalty_programs: Json
          note_count: number
          notes: string
          phone: string
          preferred_destinations: string[]
          preferred_name: string
          status: Database["public"]["Enums"]["client_status"]
          tags: string[]
          travel_styles: string[]
          trip_count: number
          version: number
        }[]
      }
      agent_client_roster: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["client_status"][]
          p_tags?: string[]
        }
        Returns: {
          archived_at: string
          as_of_date: string
          client_id: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          last_contact_at: string
          last_name: string
          last_trip_end_date: string
          last_trip_title: string
          lifetime_currency: string
          lifetime_value_cents: string
          next_trip_destinations: string[]
          next_trip_start_date: string
          next_trip_status: Database["public"]["Enums"]["trip_status"]
          next_trip_title: string
          phone: string
          status: Database["public"]["Enums"]["client_status"]
          tags: string[]
          total_count: number
          trip_count: number
        }[]
      }
      agent_client_roster_summary: {
        Args: never
        Returns: {
          active_count: number
          archived_count: number
          in_motion_count: number
          inquiry_count: number
          tag_facets: Json
        }[]
      }
      agent_client_trips: {
        Args: { p_client_id: string }
        Returns: {
          as_of_date: string
          currency: string
          destinations: string[]
          end_date: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          title: string
          total_commission_cents: string
          total_paid_cents: string
          total_value_cents: string
          traveler_count: number
          trip_id: string
          trip_type: Database["public"]["Enums"]["trip_type"]
        }[]
      }
      agent_commission_cash_in: {
        Args: never
        Returns: {
          bucket: string
          cents: string
          month_start: string
          received_cents: string
          trip_count: number
        }[]
      }
      agent_commission_dashboard: {
        Args: never
        Returns: {
          as_of_date: string
          at_risk_cents: string
          avg_rate_pct: number
          currency: string
          disputed_count: number
          ly_avg_rate_pct: number
          ly_received_cents: string
          prior_12_cents: string
          trailing_12_cents: string
          upcoming_commission_cents: string
          upcoming_trip_count: number
          ytd_received_cents: string
        }[]
      }
      agent_commission_forecast: {
        Args: never
        Returns: {
          as_of_date: string
          raw_cents: string
          status: Database["public"]["Enums"]["trip_status"]
          total_raw_cents: string
          total_weighted_cents: string
          trip_count: number
          weight_pct: number
          weighted_cents: string
        }[]
      }
      agent_commission_import: {
        Args: { p_import_id: string }
        Returns: {
          already_recorded_count: number
          as_of_date: string
          column_map: Json
          confirmed_count: number
          created_at: string
          duplicate_count: number
          headers: string[]
          ignored_count: number
          import_id: string
          original_filename: string
          period_end: string
          period_start: string
          reconciled_at: string
          reconciled_on: string
          sample_rows: Json
          statement_date: string
          status: Database["public"]["Enums"]["commission_import_status"]
          suggested_count: number
          to_create_count: number
          total_rows: number
          unmatched_count: number
          unreadable_count: number
          version: number
        }[]
      }
      agent_commission_import_candidates: {
        Args: { p_import_id: string; p_row_id: string }
        Returns: {
          client_name: string
          commission_id: string
          commission_pct: number
          expected_cents: string
          gross_booking_cents: string
          start_date: string
          status: Database["public"]["Enums"]["commission_status"]
          supplier_matches: boolean
          supplier_name: string
          traveler_matches: boolean
          trip_id: string
          trip_title: string
        }[]
      }
      agent_commission_import_rows: {
        Args: { p_import_id: string }
        Returns: {
          currency: string
          fee_cents: string
          gross_cents: string
          line_client_name: string
          line_commission_pct: number
          line_expected_cents: string
          line_fee_cents: string
          line_gross_cents: string
          line_id: string
          line_received_at: string
          line_received_cents: string
          line_status: Database["public"]["Enums"]["commission_status"]
          line_supplier_name: string
          line_trip_id: string
          line_trip_title: string
          match_basis: Database["public"]["Enums"]["commission_match_basis"]
          new_commission_pct: number
          new_gross_cents: string
          new_supplier_id: string
          new_supplier_name: string
          new_trip_id: string
          new_trip_title: string
          paid_on: string
          parse_error: string
          received_cents: string
          reference: string
          row_id: string
          row_number: number
          state: Database["public"]["Enums"]["commission_import_row_state"]
          supplier_text: string
          traveler_text: string
        }[]
      }
      agent_commission_imports: {
        Args: never
        Returns: {
          created_at: string
          created_on: string
          import_id: string
          matched_rows: number
          original_filename: string
          period_end: string
          period_start: string
          reconciled_at: string
          status: Database["public"]["Enums"]["commission_import_status"]
          total_rows: number
          unmatched_rows: number
        }[]
      }
      agent_commission_ledger: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_status?: Database["public"]["Enums"]["commission_status"][]
          p_supplier_id?: string
          p_travel_from?: string
          p_travel_to?: string
          p_trip_id?: string
        }
        Returns: {
          as_of_date: string
          client_display_name: string
          client_id: string
          commission_id: string
          commission_pct: number
          currency: string
          end_date: string
          expected_commission_cents: string
          gross_booking_cents: string
          inteletravel_reference: string
          processing_fee_cents: string
          received_at: string
          received_commission_cents: string
          start_date: string
          status: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          supplier_name: string
          total_count: number
          trip_archived: boolean
          trip_id: string
          trip_title: string
        }[]
      }
      agent_commission_ledger_summary: {
        Args: never
        Returns: {
          disputed_count: number
          expected_count: number
          invoiced_count: number
          lost_count: number
          received_count: number
          total_count: number
        }[]
      }
      agent_commission_ledger_suppliers: {
        Args: never
        Returns: {
          line_count: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      agent_commission_line: {
        Args: { p_commission_id: string }
        Returns: {
          as_of_date: string
          booked_on: string
          can_remove: boolean
          client_display_name: string
          client_id: string
          commission_id: string
          commission_pct: number
          currency: string
          expected_commission_cents: string
          expected_payment_date: string
          gross_booking_cents: string
          inteletravel_reference: string
          notes: string
          payment_lag_days: number
          payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          processing_fee_cents: string
          received_at: string
          received_commission_cents: string
          status: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          supplier_name: string
          trip_archived: boolean
          trip_end_date: string
          trip_id: string
          trip_start_date: string
          trip_status: Database["public"]["Enums"]["trip_status"]
          trip_title: string
          version: number
        }[]
      }
      agent_commission_monthly: {
        Args: never
        Returns: {
          line_count: number
          month_start: string
          received_cents: string
        }[]
      }
      agent_conversation: {
        Args: { p_conversation_id: string }
        Returns: {
          agent_unread_count: number
          archived: boolean
          client_can_sign_in: boolean
          client_display_name: string
          client_first_name: string
          client_id: string
          conversation_id: string
          overdue: boolean
          reply_due_at: string
          subject: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_conversation_messages: {
        Args: { p_conversation_id: string }
        Returns: {
          attachments: Json
          body: string
          channel: string
          created_at: string
          emailed_at: string
          is_auto_reply: boolean
          is_internal_note: boolean
          message_id: string
          sender_role: string
          total_messages: number
        }[]
      }
      agent_create_client: {
        Args: {
          p_agent_id: string
          p_city: string
          p_client_id: string
          p_country: string
          p_date_of_birth: string
          p_email: string
          p_first_name: string
          p_important_dates: Json
          p_last_name: string
          p_line1: string
          p_line2: string
          p_notes: string
          p_phone: string
          p_postal_code: string
          p_preferred_name: string
          p_region: string
          p_tags: string[]
        }
        Returns: {
          client_id: string
          outcome: string
        }[]
      }
      agent_create_commission: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_commission_id: string
          p_commission_pct: number
          p_gross_cents: number
          p_inteletravel_reference: string
          p_ip: string
          p_notes: string
          p_payment_lag_days: number
          p_payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          p_status: Database["public"]["Enums"]["commission_status"]
          p_supplier_id: string
          p_trip_id: string
          p_user_agent: string
        }
        Returns: {
          commission_id: string
          outcome: string
          version: number
        }[]
      }
      agent_create_message_template: {
        Args: {
          p_agent_id: string
          p_body: string
          p_category: string
          p_name: string
          p_tags: string[]
          p_template_id: string
        }
        Returns: {
          outcome: string
        }[]
      }
      agent_create_trip: {
        Args: {
          p_agent_id: string
          p_client_id: string
          p_title: string
          p_traveler_count?: number
          p_trip_id: string
          p_trip_type: Database["public"]["Enums"]["trip_type"]
        }
        Returns: {
          outcome: string
          trip_id: string
        }[]
      }
      agent_default_signature: { Args: never; Returns: string }
      agent_default_weekly_schedule: { Args: never; Returns: Json }
      agent_delete_itinerary_activity: {
        Args: { p_activity_id: string; p_agent_id: string; p_trip_id: string }
        Returns: {
          activity_id: string
          outcome: string
        }[]
      }
      agent_delete_payment_milestone: {
        Args: { p_agent_id: string; p_milestone_id: string; p_trip_id: string }
        Returns: {
          milestone_id: string
          outcome: string
        }[]
      }
      agent_discard_commission_import: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_expected_version: number
          p_import_id: string
          p_ip: string
          p_user_agent: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_duplicate_message_template: {
        Args: { p_agent_id: string; p_new_id: string; p_source_id: string }
        Returns: {
          outcome: string
        }[]
      }
      agent_export_center: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_from: string
          p_include_contact: boolean
          p_ip: string
          p_to: string
          p_type: string
          p_user_agent: string
        }
        Returns: Json
      }
      agent_export_commission: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_ip: string
          p_status: Database["public"]["Enums"]["commission_status"][]
          p_supplier_id: string
          p_travel_from: string
          p_travel_to: string
          p_trip_id: string
          p_user_agent: string
        }
        Returns: Json
      }
      agent_export_history: {
        Args: { p_limit?: number }
        Returns: {
          audit_id: string
          created_at: string
          created_local: string
          event_type: string
          metadata: Json
        }[]
      }
      agent_generate_itinerary: {
        Args: { p_agent_id: string; p_trip_id: string }
        Returns: {
          activities_added: number
          days_added: number
          outcome: string
        }[]
      }
      agent_inbox: {
        Args: { p_limit?: number }
        Returns: {
          agent_unread_count: number
          client_display_name: string
          client_id: string
          conversation_id: string
          last_message_at: string
          last_message_preview: string
          subject: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_kpis: {
        Args: never
        Returns: {
          active_client_count: number
          active_trip_count: number
          agent_id: string
          as_of_date: string
          booked_month_cents: string
          commission_confidence_pct: number
          commission_expected_cents: string
          commission_weighted_cents: string
          currency: string
          inquiry_to_book_days: number
          inquiry_to_book_sample: number
          new_inquiry_count: number
          pipeline_value_cents: string
          unread_message_count: number
        }[]
      }
      agent_local_today: { Args: { p_agent_id: string }; Returns: string }
      agent_map_commission_import: {
        Args: {
          p_agent_id: string
          p_column_map: Json
          p_expected_version: number
          p_import_id: string
          p_rows: Json
          p_statement_date: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_mark_conversation_read: {
        Args: {
          p_agent_id: string
          p_conversation_id: string
          p_seen_up_to: string
        }
        Returns: boolean
      }
      agent_message_merge_context: {
        Args: {
          p_client_id: string
          p_milestone_id?: string
          p_trip_id?: string
        }
        Returns: {
          agent_first_name: string
          client_first_name: string
          payment_currency: string
          payment_due_date: string
          payment_label: string
          payment_link: string
          payment_owed_cents: string
          trip_destinations: string[]
          trip_end_date: string
          trip_start_date: string
          trip_title: string
        }[]
      }
      agent_message_summary: {
        Args: never
        Returns: {
          archived_threads: number
          open_threads: number
          overdue_threads: number
          unread_messages: number
          unread_threads: number
        }[]
      }
      agent_message_target: {
        Args: { p_client_id: string; p_trip_id?: string }
        Returns: {
          client_can_sign_in: boolean
          client_display_name: string
          client_first_name: string
          client_id: string
          conversation_id: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_message_template: {
        Args: { p_template_id: string }
        Returns: {
          archived: boolean
          body: string
          category: string
          name: string
          tags: string[]
          template_id: string
          updated_at: string
        }[]
      }
      agent_message_templates: {
        Args: { p_archived?: boolean }
        Returns: {
          archived: boolean
          body: string
          category: string
          name: string
          tags: string[]
          template_id: string
          updated_at: string
        }[]
      }
      agent_message_threads: {
        Args: {
          p_archived?: boolean
          p_client_id?: string
          p_limit?: number
          p_offset?: number
          p_overdue?: boolean
          p_search?: string
          p_trip_id?: string
          p_unread?: boolean
        }
        Returns: {
          agent_unread_count: number
          archived: boolean
          client_display_name: string
          client_id: string
          conversation_id: string
          last_message_at: string
          last_message_preview: string
          last_sender_role: string
          overdue: boolean
          reply_due_at: string
          subject: string
          total_count: number
          trip_id: string
          trip_title: string
        }[]
      }
      agent_payments_due: {
        Args: { p_within_days?: number }
        Returns: {
          amount_cents: string
          client_display_name: string
          client_id: string
          currency: string
          days_until: number
          due_date: string
          kind: Database["public"]["Enums"]["payment_milestone_kind"]
          label: string
          milestone_id: string
          paid_cents: string
          status: Database["public"]["Enums"]["payment_milestone_status"]
          trip_id: string
          trip_title: string
        }[]
      }
      agent_platform_user: { Args: { p_agent_id: string }; Returns: string }
      agent_push_reschedule: {
        Args: { p_agent_id: string }
        Returns: undefined
      }
      agent_reconcile_commission_import: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_ids: string[]
          p_expected_version: number
          p_import_id: string
          p_ip: string
          p_user_agent: string
        }
        Returns: {
          already_count: number
          blocking_count: number
          created_count: number
          outcome: string
          paid_count: number
          version: number
        }[]
      }
      agent_record_commission_payment: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_commission_id: string
          p_expected_version: number
          p_fee_cents: number
          p_ip: string
          p_received_at: string
          p_received_cents: number
          p_status: Database["public"]["Enums"]["commission_status"]
          p_user_agent: string
        }
        Returns: {
          gap_cents: string
          outcome: string
          version: number
        }[]
      }
      agent_remove_commission: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_commission_id: string
          p_expected_version: number
          p_ip: string
          p_user_agent: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_reorder_itinerary_activities: {
        Args: {
          p_activity_ids: string[]
          p_agent_id: string
          p_day_id: string
          p_trip_id: string
        }
        Returns: {
          moved: number
          outcome: string
        }[]
      }
      agent_reorder_trip_components: {
        Args: {
          p_agent_id: string
          p_component_ids: string[]
          p_trip_id: string
        }
        Returns: {
          moved: number
          outcome: string
        }[]
      }
      agent_report_client_lifetime_value: {
        Args: never
        Returns: {
          client_id: string
          cohort_start: string
          commission_cents: string
          display_name: string
          trip_count: number
          value_cents: string
        }[]
      }
      agent_report_commission_by_supplier: {
        Args: { p_period: string }
        Returns: {
          line_count: number
          owed_cents: string
          received_cents: string
          set_aside_count: number
          set_aside_received_cents: string
          supplier_id: string
          supplier_name: string
        }[]
      }
      agent_report_conversion_funnel: {
        Args: { p_period: string }
        Returns: {
          book_days_avg: number
          book_days_n: number
          cancelled_here: number
          open_here: number
          reached: number
          stage: number
        }[]
      }
      agent_report_export: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_basis: string
          p_ip: string
          p_period: string
          p_report: string
          p_user_agent: string
        }
        Returns: Json
      }
      agent_report_period: {
        Args: { p_period: string }
        Returns: {
          from_date: string
          to_date: string
          today: string
        }[]
      }
      agent_report_pipeline_months: {
        Args: never
        Returns: {
          bucket: string
          month_start: string
          trip_count: number
          weighted_cents: string
        }[]
      }
      agent_report_pipeline_stages: {
        Args: never
        Returns: {
          gross_cents: string
          status: Database["public"]["Enums"]["trip_status"]
          total_gross_cents: string
          total_weighted_cents: string
          trip_count: number
          weight_pct: number
          weighted_cents: string
        }[]
      }
      agent_report_revenue_by_month: {
        Args: { p_basis: string; p_period: string }
        Returns: {
          cents: string
          item_count: number
          month_start: string
          prior_cents: string
        }[]
      }
      agent_report_top_destinations: {
        Args: { p_period: string }
        Returns: {
          destination: string
          trip_count: number
          value_cents: string
        }[]
      }
      agent_resolve_commission_import_row: {
        Args: {
          p_action: string
          p_agent_id: string
          p_commission_id?: string
          p_commission_pct?: number
          p_expected_version: number
          p_gross_cents?: number
          p_import_id: string
          p_new_commission_id?: string
          p_row_id: string
          p_supplier_id?: string
          p_trip_id?: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_rest_until: {
        Args: { p_agent_id: string; p_at: string }
        Returns: {
          due_at: string
          reason: string
        }[]
      }
      agent_return_date_label: { Args: { p_ends_on: string }; Returns: string }
      agent_save_trip_as_template: {
        Args: {
          p_agent_id: string
          p_description?: string
          p_name: string
          p_trip_id: string
        }
        Returns: {
          components_saved: number
          days_saved: number
          template_id: string
        }[]
      }
      agent_send_message: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_body: string
          p_client_id?: string
          p_conversation_id?: string
          p_is_internal_note: boolean
          p_message_id: string
          p_new_conversation_id?: string
          p_seen_up_to?: string
          p_trip_id?: string
        }
        Returns: {
          conversation_id: string
          created_at: string
          outcome: string
        }[]
      }
      agent_set_client_archived: {
        Args: {
          p_agent_id: string
          p_archived: boolean
          p_client_id: string
          p_expected_version: number
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_set_conversations_archived: {
        Args: {
          p_agent_id: string
          p_archived: boolean
          p_conversation_ids: string[]
        }
        Returns: number
      }
      agent_set_message_template_archived: {
        Args: { p_agent_id: string; p_archived: boolean; p_template_id: string }
        Returns: {
          outcome: string
        }[]
      }
      agent_set_milestone_paid: {
        Args: {
          p_actor_user_id?: string
          p_agent_id: string
          p_ip?: string
          p_milestone_id: string
          p_paid_cents?: number
          p_paid_note?: string
          p_paid_on?: string
          p_paid_reference?: string
          p_status: Database["public"]["Enums"]["payment_milestone_status"]
          p_trip_id: string
          p_user_agent?: string
        }
        Returns: {
          milestone_id: string
          outcome: string
          paid_cents: string
        }[]
      }
      agent_set_milestone_pay_url: {
        Args: {
          p_actor_user_id?: string
          p_agent_id: string
          p_ip?: string
          p_milestone_id: string
          p_pay_url: string
          p_trip_id: string
          p_user_agent?: string
        }
        Returns: {
          milestone_id: string
          outcome: string
        }[]
      }
      agent_set_pipeline_weights: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_expected: Json
          p_ip: string
          p_user_agent: string
          p_weights: Json
        }
        Returns: {
          outcome: string
        }[]
      }
      agent_set_trip_notes: {
        Args: {
          p_agent_id: string
          p_expected_version: number
          p_notes: string
          p_trip_id: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_set_trip_status: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_expected_version: number
          p_reason?: string
          p_refund_detail?: string
          p_refund_status?: string
          p_status: Database["public"]["Enums"]["trip_status"]
          p_trip_id: string
        }
        Returns: {
          from_status: Database["public"]["Enums"]["trip_status"]
          outcome: string
          to_status: Database["public"]["Enums"]["trip_status"]
          version: number
        }[]
      }
      agent_settings_audit: {
        Args: {
          p_actor_user_id: string
          p_audit_id: string
          p_event_type: string
          p_ip: string
          p_metadata: Json
          p_target_entity: string
          p_target_id: string
          p_user_agent: string
        }
        Returns: undefined
      }
      agent_settings_diff: { Args: { p_new: Json; p_old: Json }; Returns: Json }
      agent_settings_end_time_off: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_id: string
          p_ip: string
          p_user_agent: string
        }
        Returns: string
      }
      agent_settings_lock: { Args: { p_agent_id: string }; Returns: boolean }
      agent_settings_save_time_off: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_auto_reply_enabled: boolean
          p_auto_reply_text: string
          p_ends_on: string
          p_id: string
          p_ip: string
          p_is_new: boolean
          p_label: string
          p_starts_on: string
          p_user_agent: string
        }
        Returns: string
      }
      agent_settings_self: { Args: never; Returns: Json }
      agent_settings_set_avatar: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_avatar_url: string
          p_ip: string
          p_user_agent: string
        }
        Returns: {
          outcome: string
          previous_url: string
        }[]
      }
      agent_settings_snapshot: { Args: { p_agent_id: string }; Returns: Json }
      agent_settings_update_availability: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_ip: string
          p_response_time_hours: number
          p_time_zone: string
          p_user_agent: string
          p_weekly_schedule: Json
        }
        Returns: string
      }
      agent_settings_update_notifications: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_client_messages_email: boolean
          p_client_messages_push: boolean
          p_ip: string
          p_quote_requests_email: boolean
          p_quote_requests_push: boolean
          p_user_agent: string
        }
        Returns: string
      }
      agent_settings_update_profile: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_bio: string
          p_display_name: string
          p_ip: string
          p_phone: string
          p_pronouns: string
          p_social_links: Json
          p_user_agent: string
        }
        Returns: string
      }
      agent_settings_update_signature: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_ip: string
          p_signature: string
          p_user_agent: string
        }
        Returns: string
      }
      agent_signature_for_conversation: {
        Args: { p_conversation_id: string }
        Returns: {
          display_name: string
          email: string
          phone: string
          signature: string
        }[]
      }
      agent_social_links_valid: { Args: { p: Json }; Returns: boolean }
      agent_suppliers: {
        Args: never
        Returns: {
          commission_payment_lag_days: number
          commission_payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          default_commission_pct: number
          kind: Database["public"]["Enums"]["supplier_kind"]
          name: string
          supplier_id: string
        }[]
      }
      agent_template: {
        Args: { p_template_id: string }
        Returns: {
          description: string
          name: string
          payload: Json
          template_id: string
          times_used: number
          trip_type: Database["public"]["Enums"]["trip_type"]
        }[]
      }
      agent_templates: {
        Args: never
        Returns: {
          component_count: number
          created_at: string
          day_count: number
          description: string
          name: string
          template_id: string
          times_used: number
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
          value_cents: string
        }[]
      }
      agent_threads_for_current_agent: {
        Args: never
        Returns: {
          agent_unread_count: number
          archived: boolean
          as_of: string
          awaiting_since: string
          client_display_name: string
          client_first_name: string
          client_id: string
          conversation_id: string
          last_message_at: string
          last_message_preview: string
          last_sender_role: string
          overdue: boolean
          reply_due_at: string
          subject: string
          trip_id: string
          trip_title: string
        }[]
      }
      agent_trip_activity: {
        Args: { p_trip_id: string }
        Returns: {
          changed_at: string
          changed_by_name: string
          from_status: Database["public"]["Enums"]["trip_status"]
          history_id: string
          to_status: Database["public"]["Enums"]["trip_status"]
        }[]
      }
      agent_trip_board: {
        Args: {
          p_departing_within_days?: number
          p_limit?: number
          p_statuses?: Database["public"]["Enums"]["trip_status"][]
        }
        Returns: {
          agent_unread_count: number
          client_display_name: string
          client_id: string
          currency: string
          destinations: string[]
          end_date: string
          next_due_cents: string
          next_due_currency: string
          next_due_date: string
          notes: string
          proposal_sent_at: string
          proposal_viewed_at: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          status_changed_at: string
          title: string
          total_commission_cents: string
          total_paid_cents: string
          total_value_cents: string
          traveler_count: number
          trip_id: string
          trip_type: Database["public"]["Enums"]["trip_type"]
          version: number
        }[]
      }
      agent_trip_components: {
        Args: { p_trip_id: string }
        Returns: {
          api_source: string
          commission_cents: string
          commission_pct: number
          component_id: string
          confirmation_number: string
          cost_cents: string
          currency: string
          display_name: string
          end_date: string
          end_time: string
          kind: Database["public"]["Enums"]["component_kind"]
          location: string
          order_index: number
          payload: Json
          start_date: string
          start_time: string
          supplier_id: string
          supplier_name: string
        }[]
      }
      agent_trip_documents: {
        Args: { p_trip_id: string }
        Returns: {
          created_at: string
          document_id: string
          filename: string
          is_sensitive: boolean
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string
          owner_user_id: string
          size_bytes: string
        }[]
      }
      agent_trip_itinerary_days: {
        Args: { p_trip_id: string }
        Returns: {
          activity_body: string
          activity_id: string
          activity_order: number
          activity_title: string
          address: string
          block: Database["public"]["Enums"]["block_kind"]
          component_id: string
          confirmation_number: string
          date: string
          day_id: string
          day_label: string
          day_number: number
          day_summary: string
          end_time: string
          gyasis_tip: string
          location: string
          phone: string
          start_time: string
        }[]
      }
      agent_trip_itinerary_meta: {
        Args: { p_trip_id: string }
        Returns: {
          closing_note: string
          cover_image_url: string
          intro_note: string
          itinerary_id: string
          last_published_at: string
          published_at: string
        }[]
      }
      agent_trip_messages: {
        Args: { p_trip_id: string }
        Returns: {
          body: string
          created_at: string
          is_internal_note: boolean
          message_id: string
          sender_role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      agent_trip_open_commission: {
        Args: { p_trip_id: string }
        Returns: {
          commission_id: string
          currency: string
          expected_commission_cents: string
          status: Database["public"]["Enums"]["commission_status"]
          supplier_name: string
          version: number
        }[]
      }
      agent_trip_overview: {
        Args: { p_trip_id: string }
        Returns: {
          api_component_count: number
          as_of_date: string
          cancellation_reason: string
          client_display_name: string
          client_id: string
          component_count: number
          currency: string
          destinations: string[]
          end_date: string
          last_activity_at: string
          manual_component_count: number
          next_unpaid_due_date: string
          notes: string
          refund_detail: string
          refund_status: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          status_changed_at: string
          title: string
          total_commission_cents: string
          total_paid_cents: string
          total_value_cents: string
          traveler_breakdown: Json
          traveler_count: number
          trip_id: string
          trip_type: Database["public"]["Enums"]["trip_type"]
          version: number
        }[]
      }
      agent_trip_payment_history: {
        Args: { p_trip_id: string }
        Returns: {
          actor_name: string
          event_id: string
          event_type: string
          metadata: Json
          milestone_id: string
          milestone_label: string
          occurred_at: string
        }[]
      }
      agent_trip_payments: {
        Args: { p_trip_id: string }
        Returns: {
          amount_cents: string
          currency: string
          due_date: string
          kind: Database["public"]["Enums"]["payment_milestone_kind"]
          label: string
          milestone_id: string
          order_index: number
          paid_at: string
          paid_cents: string
          paid_note: string
          paid_reference: string
          pay_url: string
          status: Database["public"]["Enums"]["payment_milestone_status"]
        }[]
      }
      agent_trip_roster: {
        Args: {
          p_client_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_status?: Database["public"]["Enums"]["trip_status"][]
        }
        Returns: {
          as_of_date: string
          client_display_name: string
          client_id: string
          component_count: number
          currency: string
          destinations: string[]
          end_date: string
          last_activity_at: string
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          status_changed_at: string
          title: string
          total_commission_cents: string
          total_count: number
          total_paid_cents: string
          total_value_cents: string
          traveler_count: number
          trip_id: string
          trip_type: Database["public"]["Enums"]["trip_type"]
          version: number
        }[]
      }
      agent_trip_roster_summary: {
        Args: never
        Returns: {
          booked_count: number
          cancelled_count: number
          completed_count: number
          in_progress_count: number
          inquiry_count: number
          pipeline_cents: string
          pipeline_currency: string
          proposal_count: number
          total_count: number
        }[]
      }
      agent_update_client: {
        Args: {
          p_agent_id: string
          p_city: string
          p_client_id: string
          p_country: string
          p_date_of_birth: string
          p_email: string
          p_expected_version: number
          p_first_name: string
          p_important_dates: Json
          p_last_name: string
          p_line1: string
          p_line2: string
          p_notes: string
          p_phone: string
          p_postal_code: string
          p_preferred_name: string
          p_region: string
          p_tags: string[]
        }
        Returns: {
          changed_fields: string[]
          outcome: string
          version: number
        }[]
      }
      agent_update_commission: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_clear_payment?: boolean
          p_commission_id: string
          p_commission_pct: number
          p_expected_version: number
          p_gross_cents: number
          p_inteletravel_reference: string
          p_ip: string
          p_notes: string
          p_payment_lag_days: number
          p_payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          p_status: Database["public"]["Enums"]["commission_status"]
          p_supplier_id: string
          p_user_agent: string
        }
        Returns: {
          outcome: string
          version: number
        }[]
      }
      agent_update_message_template: {
        Args: {
          p_agent_id: string
          p_body: string
          p_category: string
          p_name: string
          p_tags: string[]
          p_template_id: string
        }
        Returns: {
          outcome: string
        }[]
      }
      agent_update_template: {
        Args: {
          p_agent_id: string
          p_description?: string
          p_name: string
          p_template_id: string
        }
        Returns: {
          outcome: string
        }[]
      }
      agent_upload_commission_statement: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_audit_id: string
          p_checksum: string
          p_column_map: Json
          p_document_id: string
          p_filename: string
          p_headers: string[]
          p_import_id: string
          p_ip: string
          p_rows: Json
          p_size_bytes: number
          p_storage_key: string
          p_user_agent: string
        }
        Returns: {
          import_id: string
          outcome: string
          uploaded_at: string
        }[]
      }
      agent_upsert_client_address: {
        Args: {
          p_city: string
          p_client_id: string
          p_country: string
          p_existing_id: string
          p_line1: string
          p_line2: string
          p_postal_code: string
          p_region: string
        }
        Returns: string
      }
      agent_upsert_itinerary_activity: {
        Args: {
          p_activity_id: string
          p_address?: string
          p_agent_id: string
          p_block?: Database["public"]["Enums"]["block_kind"]
          p_body?: string
          p_confirmation_number?: string
          p_day_id: string
          p_end_time?: string
          p_gyasis_tip?: string
          p_location?: string
          p_phone?: string
          p_start_time?: string
          p_title: string
          p_trip_id: string
        }
        Returns: {
          activity_id: string
          outcome: string
        }[]
      }
      agent_upsert_itinerary_day: {
        Args: {
          p_agent_id: string
          p_date: string
          p_day_id: string
          p_label?: string
          p_summary?: string
          p_trip_id: string
        }
        Returns: {
          day_id: string
          outcome: string
        }[]
      }
      agent_upsert_payment_milestone: {
        Args: {
          p_agent_id: string
          p_amount_cents: number
          p_due_date?: string
          p_kind: Database["public"]["Enums"]["payment_milestone_kind"]
          p_label: string
          p_milestone_id: string
          p_trip_id: string
        }
        Returns: {
          milestone_id: string
          outcome: string
        }[]
      }
      agent_upsert_trip_component: {
        Args: {
          p_agent_id: string
          p_commission_cents?: number
          p_commission_pct?: number
          p_component_id: string
          p_confirmation_number?: string
          p_cost_cents?: number
          p_display_name: string
          p_end_date?: string
          p_end_time?: string
          p_kind: Database["public"]["Enums"]["component_kind"]
          p_location?: string
          p_payload?: Json
          p_start_date?: string
          p_start_time?: string
          p_supplier_id?: string
          p_trip_id: string
        }
        Returns: {
          component_id: string
          outcome: string
        }[]
      }
      agent_weekly_schedule_valid: { Args: { p: Json }; Returns: boolean }
      agent_write_client_note: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_body: string
          p_client_id: string
          p_note_id: string
          p_op: string
        }
        Returns: {
          note_id: string
          outcome: string
        }[]
      }
      alert_quote_request: { Args: { p_trip_id: string }; Returns: string }
      block_for_time: {
        Args: { p_time: string }
        Returns: Database["public"]["Enums"]["block_kind"]
      }
      client_advisor_card: { Args: never; Returns: Json }
      client_invite_code_hash: { Args: { p_code: string }; Returns: string }
      client_mark_conversation_read: {
        Args: { p_conversation_id: string; p_seen_up_to: string }
        Returns: boolean
      }
      client_merge_field_list: {
        Args: never
        Returns: {
          field: string
          ord: number
          source: string
        }[]
      }
      client_merge_fields: {
        Args: {
          p_keep: Json
          p_keep_pref: Json
          p_pinned_email: string
          p_retire: Json
          p_retire_pref: Json
        }
        Returns: Json
      }
      client_merge_is_empty: { Args: { p_value: Json }; Returns: boolean }
      client_merge_preview: {
        Args: { p_agent_id: string; p_keep_id: string; p_retire_id: string }
        Returns: Json
      }
      client_merge_summary: {
        Args: { p_client: Database["public"]["Tables"]["client"]["Row"] }
        Returns: Json
      }
      commission_audit: {
        Args: {
          p_actor_user_id: string
          p_audit_id: string
          p_event_type: string
          p_ip: string
          p_metadata: Json
          p_target_entity: string
          p_target_id: string
          p_user_agent: string
        }
        Returns: undefined
      }
      commission_fold: { Args: { p_text: string }; Returns: string }
      commission_import_match: {
        Args: { p_agent_id: string; p_import_id: string }
        Returns: undefined
      }
      commission_lines_for_current_agent: {
        Args: never
        Returns: {
          agent_id: string
          archived_at: string | null
          commission_pct: number
          component_id: string | null
          created_at: string
          currency: string
          expected_commission_cents: number
          gross_booking_cents: number
          id: string
          import_id: string | null
          inteletravel_reference: string | null
          notes: string | null
          on_record_at: string | null
          payment_lag_days: number
          payment_terms: Database["public"]["Enums"]["commission_payment_terms"]
          processing_fee_cents: number
          received_at: string | null
          received_commission_cents: number
          status: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          trip_id: string
          updated_at: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "commission"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commission_ref_key: { Args: { p_text: string }; Returns: string }
      conversation_record_client_message: {
        Args: { p_message_id: string }
        Returns: boolean
      }
      conversation_reply_due_at: {
        Args: { p_since: string; p_time_zone: string }
        Returns: string
      }
      cruise_sailing_search: {
        Args: {
          depart_from?: string
          depart_to?: string
          max_nights?: number
          max_rows?: number
          min_nights?: number
          needle?: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          cruise_line_id: string
          currency: string | null
          departure_date: string
          destinations: string[]
          duration_nights: number | null
          first_seen_at: string
          id: string
          itinerary_url: string | null
          last_seen_at: string | null
          lead_price_cents: number | null
          lead_price_eur_cents: number | null
          provider: string
          provider_key: string
          provider_locale: string
          provider_payload: Json | null
          provider_updated_at: string | null
          ship_id: string | null
          synced_at: string | null
          title: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cruise_sailing"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cruise_sync_tick: { Args: never; Returns: number }
      cruise_sync_watchdog: { Args: { p_window?: string }; Returns: string }
      current_agent_id: { Args: never; Returns: string }
      current_client_mailing_address_id: { Args: never; Returns: string }
      current_platform_user: {
        Args: never
        Returns: {
          account_id: string
          agent_id: string | null
          avatar_url: string | null
          client_id: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          onboarding_completed_at: string | null
          onboarding_step: string | null
          role: Database["public"]["Enums"]["user_role"]
          time_zone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_user"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      email_claim_due: {
        Args: { p_limit?: number }
        Returns: {
          agent_first_name: string
          client_first_name: string
          conversation_id: string
          messages: Json
          outbox_id: string
          previous_outbox_id: string
          recipient: string
          trip_title: string
        }[]
      }
      email_client_user: { Args: { p_client_id: string }; Returns: string }
      email_dispatch_tick: { Args: never; Returns: string }
      email_finish: {
        Args: {
          p_error?: string
          p_ok: boolean
          p_outbox_id: string
          p_permanent?: boolean
        }
        Returns: string
      }
      email_inbound_record: {
        Args: {
          p_auto_reply?: boolean
          p_body: string
          p_files: number
          p_from: string
          p_message_id: string
          p_provider_email_id: string
          p_reply_outbox_id?: string
          p_sender_verified: boolean
          p_token_hash: string
        }
        Returns: {
          duplicate: boolean
          message_id: string
          outcome: string
          reply_to: string
        }[]
      }
      email_inbox_tick: { Args: never; Returns: string }
      email_messages_opted_out: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      email_record_tokens: {
        Args: {
          p_outbox_id: string
          p_reply_hash: string
          p_unsub_hash: string
        }
        Returns: undefined
      }
      email_release: { Args: { p_outbox_id: string }; Returns: string }
      email_set_messages_email: {
        Args: { p_on: boolean; p_token_hash: string }
        Returns: string
      }
      email_unsubscribe_status: {
        Args: { p_token_hash: string }
        Returns: string
      }
      hotel_search_gc: {
        Args: never
        Returns: {
          buckets_deleted: number
          cache_deleted: number
          details_cleared: number
        }[]
      }
      hotel_search_take_token: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_kind: Database["public"]["Enums"]["hotel_rate_window"]
          p_window_start: string
        }
        Returns: {
          allowed: boolean
          hits: number
        }[]
      }
      itinerary_for_trip: { Args: { p_trip_id: string }; Returns: string }
      itinerary_touch: { Args: { p_itinerary_id: string }; Returns: undefined }
      message_preview: { Args: { p_body: string }; Returns: string }
      message_template_check: {
        Args: {
          p_body: string
          p_category: string
          p_name: string
          p_tags: string[]
        }
        Returns: undefined
      }
      message_template_clean_tags: {
        Args: { p_tags: string[] }
        Returns: string[]
      }
      message_template_fields: { Args: never; Returns: string[] }
      message_template_unknown_tokens: {
        Args: { p_body: string }
        Returns: string[]
      }
      pay_url_host: { Args: { p_url: string }; Returns: string }
      payment_milestone_audit: {
        Args: {
          p_actor_user_id: string
          p_agent_id: string
          p_event_type: string
          p_ip: string
          p_metadata: Json
          p_milestone_id: string
          p_user_agent: string
        }
        Returns: undefined
      }
      push_claim_dismissals: {
        Args: { p_limit?: number }
        Returns: {
          agent_id: string
          conversation_id: string
          read_up_to: string
        }[]
      }
      push_claim_due: {
        Args: { p_limit?: number }
        Returns: {
          agent_id: string
          client_name: string
          conversation_id: string
          destination: string
          end_date: string
          held: boolean
          hold_reason: string
          kind: string
          latest_created_at: string
          message_count: number
          outbox_id: string
          preview: string
          start_date: string
          trip_id: string
          trip_title: string
        }[]
      }
      push_device_gone: { Args: { p_device_id: string }; Returns: undefined }
      push_devices_for_agent: {
        Args: { p_agent_id: string }
        Returns: {
          device_id: string
          fcm_token: string
          platform: Database["public"]["Enums"]["push_platform"]
          web_auth: string
          web_endpoint: string
          web_p256dh: string
        }[]
      }
      push_dispatch_tick: { Args: never; Returns: string }
      push_due_at: {
        Args: { p_at: string; p_time_zone: string }
        Returns: string
      }
      push_finish: {
        Args: { p_ok: boolean; p_outbox_id: string }
        Returns: string
      }
      push_register_device: {
        Args: {
          p_device_id: string
          p_fcm_token?: string
          p_label?: string
          p_platform: Database["public"]["Enums"]["push_platform"]
          p_user_id: string
          p_web_auth?: string
          p_web_endpoint?: string
          p_web_p256dh?: string
        }
        Returns: string
      }
      push_unregister_device: {
        Args: {
          p_fcm_token?: string
          p_user_id: string
          p_web_endpoint?: string
        }
        Returns: number
      }
      report_agent_today: {
        Args: { p_agent_id: string }
        Returns: {
          agent_id: string
          time_zone: string
          today: string
        }[]
      }
      report_check_range: {
        Args: { p_from: string; p_to: string }
        Returns: undefined
      }
      report_client_lifetime_value: {
        Args: { p_agent_id: string }
        Returns: {
          client_id: string
          cohort_start: string
          commission_cents: number
          display_name: string
          trip_count: number
          value_cents: number
        }[]
      }
      report_commission_by_supplier: {
        Args: { p_agent_id: string; p_period: string }
        Returns: {
          line_count: number
          owed_cents: number
          received_cents: number
          set_aside_count: number
          set_aside_received_cents: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      report_conversion_funnel: {
        Args: { p_agent_id: string; p_period: string }
        Returns: {
          book_days_avg: number
          book_days_n: number
          cancelled_here: number
          open_here: number
          reached: number
          stage: number
        }[]
      }
      report_export_clients: {
        Args: { p_agent_id: string; p_include_contact: boolean }
        Returns: {
          added_on: string
          address_line1: string
          address_line2: string
          city: string
          client_name: string
          country: string
          email: string
          phone: string
          postal_code: string
          region: string
          status: Database["public"]["Enums"]["client_status"]
          trip_count: number
          value_cents: number
        }[]
      }
      report_export_milestones: {
        Args: { p_agent_id: string; p_from: string; p_to: string }
        Returns: {
          amount_cents: number
          client_name: string
          due_date: string
          kind: Database["public"]["Enums"]["payment_milestone_kind"]
          label: string
          paid_cents: number
          paid_on: string
          paid_reference: string
          pay_site: string
          status: Database["public"]["Enums"]["payment_milestone_status"]
          trip_title: string
        }[]
      }
      report_export_trips: {
        Args: { p_agent_id: string; p_from: string; p_to: string }
        Returns: {
          client_name: string
          commission_cents: number
          created_on: string
          destinations: string
          end_date: string
          first_booked_on: string
          paid_cents: number
          start_date: string
          status: Database["public"]["Enums"]["trip_status"]
          trip_title: string
          value_cents: number
        }[]
      }
      report_first_committed_at: {
        Args: { p_trip_id: string }
        Returns: string
      }
      report_period_bounds: {
        Args: { p_period: string; p_today: string }
        Returns: {
          from_date: string
          prior_from: string
          prior_to: string
          to_date: string
        }[]
      }
      report_pipeline_months: {
        Args: { p_agent_id: string }
        Returns: {
          bucket: string
          month_start: string
          trip_count: number
          weighted_cents: number
        }[]
      }
      report_pipeline_stages: {
        Args: { p_agent_id: string }
        Returns: {
          gross_cents: number
          status: Database["public"]["Enums"]["trip_status"]
          total_gross_cents: number
          total_weighted_cents: number
          trip_count: number
          weight_pct: number
          weighted_cents: number
        }[]
      }
      report_revenue_by_month: {
        Args: { p_agent_id: string; p_basis: string; p_period: string }
        Returns: {
          cents: number
          item_count: number
          month_start: string
          prior_cents: number
        }[]
      }
      report_top_destinations: {
        Args: { p_agent_id: string; p_period: string }
        Returns: {
          destination: string
          trip_count: number
          value_cents: number
        }[]
      }
      seed_starter_message_templates: {
        Args: { p_agent_id: string }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sweep_dated_promises: {
        Args: never
        Returns: {
          milestones_marked_overdue: number
        }[]
      }
      text_has_card_digits: { Args: { p_text: string }; Returns: boolean }
      uuid_v7: { Args: never; Returns: string }
    }
    Enums: {
      agent_status: "active" | "inactive" | "archived"
      auth_event_type:
        | "login_attempt"
        | "login_success"
        | "login_failure"
        | "password_reset_request"
        | "password_reset_complete"
        | "mfa_challenge_issued"
        | "mfa_challenge_success"
        | "mfa_challenge_failure"
        | "account_locked"
        | "account_unlocked"
        | "session_revoked"
      auth_provider: "email" | "google" | "apple"
      block_kind: "morning" | "afternoon" | "evening" | "all_day"
      client_status: "active" | "archived" | "merged_into"
      commission_import_row_state:
        | "confirmed"
        | "suggested"
        | "unmatched"
        | "duplicate"
        | "unreadable"
        | "already_recorded"
        | "to_create"
        | "ignored"
      commission_import_status:
        | "mapping"
        | "review"
        | "reconciled"
        | "discarded"
      commission_match_basis:
        | "reference"
        | "confirmation"
        | "supplier_and_traveler"
        | "manual"
        | "none"
      commission_payment_terms: "at_booking" | "after_travel"
      commission_status:
        | "expected"
        | "invoiced"
        | "received"
        | "disputed"
        | "lost"
      component_kind:
        | "flight"
        | "hotel"
        | "cruise"
        | "transfer"
        | "excursion"
        | "insurance"
        | "custom"
      cruise_sync_endpoint:
        | "cruise_lines"
        | "filter_options"
        | "coverage"
        | "ships"
        | "ports"
        | "cruises"
        | "cruise_detail"
      cruise_sync_status: "running" | "ok" | "partial" | "skipped" | "failed"
      cruise_sync_trigger: "cron" | "manual"
      document_kind:
        | "passport"
        | "visa"
        | "insurance_cert"
        | "supplier_confirmation"
        | "receipt"
        | "photo"
        | "csv_import"
        | "pdf_proposal"
        | "pdf_itinerary"
        | "other"
      hotel_rate_window: "minute" | "hour" | "day"
      hotel_search_endpoint: "search" | "account"
      hotel_search_outcome:
        | "served_live"
        | "served_cache"
        | "served_stale"
        | "rate_limited"
        | "budget_exhausted"
        | "provider_unavailable"
        | "rejected"
      mfa_kind: "totp" | "sms" | "backup_codes"
      payment_milestone_kind: "deposit" | "interim" | "final"
      payment_milestone_status: "scheduled" | "paid" | "waived" | "overdue"
      push_platform: "android" | "web" | "ios"
      supplier_kind:
        | "airline"
        | "hotel_brand"
        | "resort"
        | "cruise_line"
        | "tour_operator"
        | "insurance"
        | "transfer"
        | "other"
      supplier_payment_kind: "api" | "portal" | "unknown"
      testimonial_status:
        | "draft"
        | "submitted"
        | "approved"
        | "published"
        | "declined"
      travel_doc_kind:
        | "passport"
        | "visa"
        | "drivers_license"
        | "nexus"
        | "globalentry"
        | "insurance"
        | "vaccination"
        | "other"
      trip_status:
        | "inquiry"
        | "proposal"
        | "booked"
        | "in_progress"
        | "completed"
        | "cancelled"
      trip_type:
        | "cruise"
        | "all_inclusive"
        | "multi_destination"
        | "group"
        | "custom"
      user_role: "client" | "agent" | "admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      agent_status: ["active", "inactive", "archived"],
      auth_event_type: [
        "login_attempt",
        "login_success",
        "login_failure",
        "password_reset_request",
        "password_reset_complete",
        "mfa_challenge_issued",
        "mfa_challenge_success",
        "mfa_challenge_failure",
        "account_locked",
        "account_unlocked",
        "session_revoked",
      ],
      auth_provider: ["email", "google", "apple"],
      block_kind: ["morning", "afternoon", "evening", "all_day"],
      client_status: ["active", "archived", "merged_into"],
      commission_import_row_state: [
        "confirmed",
        "suggested",
        "unmatched",
        "duplicate",
        "unreadable",
        "already_recorded",
        "to_create",
        "ignored",
      ],
      commission_import_status: [
        "mapping",
        "review",
        "reconciled",
        "discarded",
      ],
      commission_match_basis: [
        "reference",
        "confirmation",
        "supplier_and_traveler",
        "manual",
        "none",
      ],
      commission_payment_terms: ["at_booking", "after_travel"],
      commission_status: [
        "expected",
        "invoiced",
        "received",
        "disputed",
        "lost",
      ],
      component_kind: [
        "flight",
        "hotel",
        "cruise",
        "transfer",
        "excursion",
        "insurance",
        "custom",
      ],
      cruise_sync_endpoint: [
        "cruise_lines",
        "filter_options",
        "coverage",
        "ships",
        "ports",
        "cruises",
        "cruise_detail",
      ],
      cruise_sync_status: ["running", "ok", "partial", "skipped", "failed"],
      cruise_sync_trigger: ["cron", "manual"],
      document_kind: [
        "passport",
        "visa",
        "insurance_cert",
        "supplier_confirmation",
        "receipt",
        "photo",
        "csv_import",
        "pdf_proposal",
        "pdf_itinerary",
        "other",
      ],
      hotel_rate_window: ["minute", "hour", "day"],
      hotel_search_endpoint: ["search", "account"],
      hotel_search_outcome: [
        "served_live",
        "served_cache",
        "served_stale",
        "rate_limited",
        "budget_exhausted",
        "provider_unavailable",
        "rejected",
      ],
      mfa_kind: ["totp", "sms", "backup_codes"],
      payment_milestone_kind: ["deposit", "interim", "final"],
      payment_milestone_status: ["scheduled", "paid", "waived", "overdue"],
      push_platform: ["android", "web", "ios"],
      supplier_kind: [
        "airline",
        "hotel_brand",
        "resort",
        "cruise_line",
        "tour_operator",
        "insurance",
        "transfer",
        "other",
      ],
      supplier_payment_kind: ["api", "portal", "unknown"],
      testimonial_status: [
        "draft",
        "submitted",
        "approved",
        "published",
        "declined",
      ],
      travel_doc_kind: [
        "passport",
        "visa",
        "drivers_license",
        "nexus",
        "globalentry",
        "insurance",
        "vaccination",
        "other",
      ],
      trip_status: [
        "inquiry",
        "proposal",
        "booked",
        "in_progress",
        "completed",
        "cancelled",
      ],
      trip_type: [
        "cruise",
        "all_inclusive",
        "multi_destination",
        "group",
        "custom",
      ],
      user_role: ["client", "agent", "admin"],
    },
  },
} as const

