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
      clientes: {
        Row: {
          cidade: string | null
          created_at: string
          documento: string | null
          email: string | null
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
          cidade?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
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
          cidade?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
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
      pedido_itens: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          nome_produto: string
          pedido_id: string
          quantidade: number
          tamanho: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          nome_produto: string
          pedido_id: string
          quantidade?: number
          tamanho?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          nome_produto?: string
          pedido_id?: string
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
          estado: string | null
          etapa_entrada_em: string | null
          etapa_producao: string | null
          frete: number
          id: string
          numero_pedido: string
          nuvemshop_order_id: number | null
          origem: string
          rastreio_codigo: string | null
          superfrete_order_id: string | null
          taxa_pagarme: number
          updated_at: string
          valor_bruto: number
          valor_liquido: number
          vendedor_id: string | null
        }
        Insert: {
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
          estado?: string | null
          etapa_entrada_em?: string | null
          etapa_producao?: string | null
          frete?: number
          id?: string
          numero_pedido: string
          nuvemshop_order_id?: number | null
          origem?: string
          rastreio_codigo?: string | null
          superfrete_order_id?: string | null
          taxa_pagarme?: number
          updated_at?: string
          valor_bruto?: number
          valor_liquido?: number
          vendedor_id?: string | null
        }
        Update: {
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
          estado?: string | null
          etapa_entrada_em?: string | null
          etapa_producao?: string | null
          frete?: number
          id?: string
          numero_pedido?: string
          nuvemshop_order_id?: number | null
          origem?: string
          rastreio_codigo?: string | null
          superfrete_order_id?: string | null
          taxa_pagarme?: number
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
      vendedores: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          status: string
          taxa_comissao: number
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
      [_ in never]: never
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
