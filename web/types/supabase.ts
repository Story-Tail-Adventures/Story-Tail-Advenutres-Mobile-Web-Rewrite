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
          user_agent: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          email_attempted?: string | null
          event_type: Database["public"]["Enums"]["auth_event_type"]
          failure_reason?: string | null
          id: string
          ip_address: unknown
          result: string
          user_agent: string
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
          user_agent?: string
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
      authorization_request: {
        Row: {
          client_id: string
          completed_at: string | null
          completed_card_authorization_id: string | null
          expires_at: string
          id: string
          personal_note: string | null
          proposed_expiry: string
          proposed_limit_cents: number
          requesting_agent_id: string
          sent_at: string
          status: Database["public"]["Enums"]["auth_request_status"]
          token_hash: string
          trip_id: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          completed_card_authorization_id?: string | null
          expires_at: string
          id: string
          personal_note?: string | null
          proposed_expiry: string
          proposed_limit_cents: number
          requesting_agent_id: string
          sent_at?: string
          status?: Database["public"]["Enums"]["auth_request_status"]
          token_hash: string
          trip_id: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          completed_card_authorization_id?: string | null
          expires_at?: string
          id?: string
          personal_note?: string | null
          proposed_expiry?: string
          proposed_limit_cents?: number
          requesting_agent_id?: string
          sent_at?: string
          status?: Database["public"]["Enums"]["auth_request_status"]
          token_hash?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorization_request_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_request_completed_card_authorization_id_fkey"
            columns: ["completed_card_authorization_id"]
            isOneToOne: false
            referencedRelation: "card_authorization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_request_requesting_agent_id_fkey"
            columns: ["requesting_agent_id"]
            isOneToOne: false
            referencedRelation: "agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_request_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      card_authorization: {
        Row: {
          amount_used_cents: number
          consent_payload: Json
          created_at: string
          expires_at: string
          id: string
          payment_card_id: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          spending_limit_cents: number
          status: Database["public"]["Enums"]["card_auth_status"]
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_used_cents?: number
          consent_payload: Json
          created_at?: string
          expires_at: string
          id: string
          payment_card_id: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          spending_limit_cents: number
          status?: Database["public"]["Enums"]["card_auth_status"]
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_used_cents?: number
          consent_payload?: Json
          created_at?: string
          expires_at?: string
          id?: string
          payment_card_id?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          spending_limit_cents?: number
          status?: Database["public"]["Enums"]["card_auth_status"]
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_authorization_payment_card_id_fkey"
            columns: ["payment_card_id"]
            isOneToOne: false
            referencedRelation: "payment_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_authorization_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_authorization_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
            referencedColumns: ["id"]
          },
        ]
      }
      card_use_event: {
        Row: {
          agent_user_id: string
          amount_cents: number
          card_authorization_id: string
          client_flag_status: string
          client_flagged_at: string | null
          created_at: string
          currency: string
          id: string
          justification: string
          payment_card_id: string
          receipt_document_id: string | null
          reference_number: string | null
          supplier_id: string | null
          supplier_name_snapshot: string
          trip_id: string
        }
        Insert: {
          agent_user_id: string
          amount_cents: number
          card_authorization_id: string
          client_flag_status?: string
          client_flagged_at?: string | null
          created_at?: string
          currency?: string
          id: string
          justification: string
          payment_card_id: string
          receipt_document_id?: string | null
          reference_number?: string | null
          supplier_id?: string | null
          supplier_name_snapshot: string
          trip_id: string
        }
        Update: {
          agent_user_id?: string
          amount_cents?: number
          card_authorization_id?: string
          client_flag_status?: string
          client_flagged_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          justification?: string
          payment_card_id?: string
          receipt_document_id?: string | null
          reference_number?: string | null
          supplier_id?: string | null
          supplier_name_snapshot?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_use_event_agent_user_id_fkey"
            columns: ["agent_user_id"]
            isOneToOne: false
            referencedRelation: "platform_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_use_event_card_authorization_id_fkey"
            columns: ["card_authorization_id"]
            isOneToOne: false
            referencedRelation: "card_authorization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_use_event_payment_card_id_fkey"
            columns: ["payment_card_id"]
            isOneToOne: false
            referencedRelation: "payment_card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_use_event_receipt_fk"
            columns: ["receipt_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_use_event_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_use_event_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trip"
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
          lifetime_value_cents: number
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
          lifetime_value_cents?: number
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
          lifetime_value_cents?: number
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
          commission_pct: number
          component_id: string | null
          created_at: string
          expected_commission_cents: number
          gross_booking_cents: number
          id: string
          import_id: string | null
          inteletravel_reference: string | null
          notes: string | null
          payment_terms: string
          received_at: string | null
          received_commission_cents: number
          status: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          commission_pct: number
          component_id?: string | null
          created_at?: string
          expected_commission_cents: number
          gross_booking_cents: number
          id: string
          import_id?: string | null
          inteletravel_reference?: string | null
          notes?: string | null
          payment_terms: string
          received_at?: string | null
          received_commission_cents?: number
          status?: Database["public"]["Enums"]["commission_status"]
          supplier_id: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          commission_pct?: number
          component_id?: string | null
          created_at?: string
          expected_commission_cents?: number
          gross_booking_cents?: number
          id?: string
          import_id?: string | null
          inteletravel_reference?: string | null
          notes?: string | null
          payment_terms?: string
          received_at?: string | null
          received_commission_cents?: number
          status?: Database["public"]["Enums"]["commission_status"]
          supplier_id?: string
          trip_id?: string
          updated_at?: string
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
          created_at: string
          document_id: string | null
          id: string
          imported_by_user_id: string
          matched_rows: number
          original_filename: string
          period_end: string | null
          period_start: string | null
          source: string
          total_rows: number
          unmatched_rows: number
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id: string
          imported_by_user_id: string
          matched_rows?: number
          original_filename: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          total_rows?: number
          unmatched_rows?: number
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          imported_by_user_id?: string
          matched_rows?: number
          original_filename?: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          total_rows?: number
          unmatched_rows?: number
        }
        Relationships: [
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
          conversation_id: string
          created_at: string
          id: string
          is_internal_note: boolean
          read_by_other_at: string | null
          sender_role: Database["public"]["Enums"]["user_role"]
          sender_user_id: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id: string
          is_internal_note?: boolean
          read_by_other_at?: string | null
          sender_role: Database["public"]["Enums"]["user_role"]
          sender_user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
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
      payment_card: {
        Row: {
          brand: string
          client_id: string
          consent_recorded_at: string
          created_at: string
          exp_month: number
          exp_year: number
          id: string
          last4: string
          nickname: string | null
          revoked_at: string | null
          revoked_reason: string | null
          status: Database["public"]["Enums"]["card_status"]
          stripe_customer_id: string
          stripe_payment_method_id: string
          updated_at: string
        }
        Insert: {
          brand: string
          client_id: string
          consent_recorded_at: string
          created_at?: string
          exp_month: number
          exp_year: number
          id: string
          last4: string
          nickname?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          stripe_customer_id: string
          stripe_payment_method_id: string
          updated_at?: string
        }
        Update: {
          brand?: string
          client_id?: string
          consent_recorded_at?: string
          created_at?: string
          exp_month?: number
          exp_year?: number
          id?: string
          last4?: string
          nickname?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          stripe_customer_id?: string
          stripe_payment_method_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_card_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
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
          commission_payment_terms: string | null
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
          commission_payment_terms?: string | null
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
          commission_payment_terms?: string | null
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
      client_invite_code_hash: { Args: { p_code: string }; Returns: string }
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
      auth_request_status: "pending" | "completed" | "expired" | "cancelled"
      block_kind: "morning" | "afternoon" | "evening" | "all_day"
      card_auth_status: "active" | "revoked" | "expired" | "exhausted"
      card_status: "active" | "revoked" | "expired" | "failed"
      client_status: "active" | "archived" | "merged_into"
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
      mfa_kind: "totp" | "sms" | "backup_codes"
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
      auth_request_status: ["pending", "completed", "expired", "cancelled"],
      block_kind: ["morning", "afternoon", "evening", "all_day"],
      card_auth_status: ["active", "revoked", "expired", "exhausted"],
      card_status: ["active", "revoked", "expired", "failed"],
      client_status: ["active", "archived", "merged_into"],
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
      mfa_kind: ["totp", "sms", "backup_codes"],
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

