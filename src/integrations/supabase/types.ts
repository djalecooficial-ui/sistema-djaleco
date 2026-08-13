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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cart_recovery_conversations: {
        Row: {
          cart_data: Json | null
          cart_id: string
          created_at: string | null
          customer_name: string | null
          id: string
          messages: Json | null
          phone: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cart_data?: Json | null
          cart_id: string
          created_at?: string | null
          customer_name?: string | null
          id?: string
          messages?: Json | null
          phone: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cart_data?: Json | null
          cart_id?: string
          created_at?: string | null
          customer_name?: string | null
          id?: string
          messages?: Json | null
          phone?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          created_at: string
          documento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: string
          primeira_compra: string | null
          tags: string[]
          telefone: string | null
          total_gasto: number
          total_pedidos: number
          ultima_compra: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string
          primeira_compra?: string | null
          tags?: string[]
          telefone?: string | null
          total_gasto?: number
          total_pedidos?: number
          ultima_compra?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string
          primeira_compra?: string | null
          tags?: string[]
          telefone?: string | null
          total_gasto?: number
          total_pedidos?: number
          ultima_compra?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      crm_contacts: {
        Row: {
          ai_enabled: boolean
          ai_suggestion: Json | null
          ai_suggestion_at: string | null
          avatar_url: string | null
          created_at: string | null
          direcao: string | null
          email: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          nome: string
          notas: string | null
          origem: string | null
          pedido_confirmado_at: string | null
          pedido_numero: string | null
          pedido_valor: number | null
          push_name: string | null
          status: string | null
          tags: string[] | null
          telefone: string
          unread_count: number
          updated_at: string | null
        }
        Insert: {
          ai_enabled?: boolean
          ai_suggestion?: Json | null
          ai_suggestion_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          direcao?: string | null
          email?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          nome: string
          notas?: string | null
          origem?: string | null
          pedido_confirmado_at?: string | null
          pedido_numero?: string | null
          pedido_valor?: number | null
          push_name?: string | null
          status?: string | null
          tags?: string[] | null
          telefone: string
          unread_count?: number
          updated_at?: string | null
        }
        Update: {
          ai_enabled?: boolean
          ai_suggestion?: Json | null
          ai_suggestion_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          direcao?: string | null
          email?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          nome?: string
          notas?: string | null
          origem?: string | null
          pedido_confirmado_at?: string | null
          pedido_numero?: string | null
          pedido_valor?: number | null
          push_name?: string | null
          status?: string | null
          tags?: string[] | null
          telefone?: string
          unread_count?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_attachments: {
        Row: {
          categoria: string | null
          created_at: string | null
          file_mime: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string | null
          file_mime: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          file_mime?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_knowledge_base: {
        Row: {
          categoria: string | null
          conteudo: string
          created_at: string | null
          id: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          conteudo: string
          created_at?: string | null
          id?: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          conteudo?: string
          created_at?: string | null
          id?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_messages: {
        Row: {
          caption: string | null
          contact_id: string
          conteudo: string | null
          created_at: string
          deleted_at: string | null
          direcao: string
          evolution_message_id: string | null
          id: string
          is_ai_generated: boolean
          media_filename: string | null
          media_mime: string | null
          media_type: string | null
          media_url: string | null
          transcription: string | null
        }
        Insert: {
          caption?: string | null
          contact_id: string
          conteudo?: string | null
          created_at?: string
          deleted_at?: string | null
          direcao?: string
          evolution_message_id?: string | null
          id?: string
          is_ai_generated?: boolean
          media_filename?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          transcription?: string | null
        }
        Update: {
          caption?: string | null
          contact_id?: string
          conteudo?: string | null
          created_at?: string
          deleted_at?: string | null
          direcao?: string
          evolution_message_id?: string | null
          id?: string
          is_ai_generated?: boolean
          media_filename?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          nome_produto: string
          pedido_id: string
          preco_unitario: number | null
          quantidade: number
          tamanho: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          nome_produto: string
          pedido_id: string
          preco_unitario?: number | null
          quantidade?: number
          tamanho?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          nome_produto?: string
          pedido_id?: string
          preco_unitario?: number | null
          quantidade?: number
          tamanho?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cliente_nome: string
          cliente_telefone: string | null
          comissao: number
          comissao_paga: boolean
          comissao_paga_em: string | null
          created_at: string
          data_despacho: string | null
          data_entrega: string | null
          data_pedido: string
          endereco: string | null
          estado: string | null
          etapa_entrada_em: string | null
          etapa_producao: string | null
          forma_pagamento: string | null
          frete: number
          id: string
          numero_pedido: string
          nuvemshop_order_id: number | null
          observacoes_pedido: string | null
          origem: string
          parcelas: number | null
          rastreio_codigo: string | null
          status_pagamento: string
          superfrete_order_id: string | null
          taxa_pagarme: number
          taxa_ted: number
          ted_confirmado: boolean
          updated_at: string
          valor_bruto: number
          valor_liquido: number
          vendedor_id: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          comissao?: number
          comissao_paga?: boolean
          comissao_paga_em?: string | null
          created_at?: string
          data_despacho?: string | null
          data_entrega?: string | null
          data_pedido?: string
          endereco?: string | null
          estado?: string | null
          etapa_entrada_em?: string | null
          etapa_producao?: string | null
          forma_pagamento?: string | null
          frete?: number
          id?: string
          numero_pedido: string
          nuvemshop_order_id?: number | null
          observacoes_pedido?: string | null
          origem?: string
          parcelas?: number | null
          rastreio_codigo?: string | null
          status_pagamento?: string
          superfrete_order_id?: string | null
          taxa_pagarme?: number
          taxa_ted?: number
          ted_confirmado?: boolean
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
          vendedor_id?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          comissao?: number
          comissao_paga?: boolean
          comissao_paga_em?: string | null
          created_at?: string
          data_despacho?: string | null
          data_entrega?: string | null
          data_pedido?: string
          endereco?: string | null
          estado?: string | null
          etapa_entrada_em?: string | null
          etapa_producao?: string | null
          forma_pagamento?: string | null
          frete?: number
          id?: string
          numero_pedido?: string
          nuvemshop_order_id?: number | null
          observacoes_pedido?: string | null
          origem?: string
          parcelas?: number | null
          rastreio_codigo?: string | null
          status_pagamento?: string
          superfrete_order_id?: string | null
          taxa_pagarme?: number
          taxa_ted?: number
          ted_confirmado?: boolean
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          status: string
          taxa_comissao: number
          taxa_comissao_site: number
          taxa_comissao_whatsapp: number
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          status?: string
          taxa_comissao?: number
          taxa_comissao_site?: number
          taxa_comissao_whatsapp?: number
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          status?: string
          taxa_comissao?: number
          taxa_comissao_site?: number
          taxa_comissao_whatsapp?: number
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
