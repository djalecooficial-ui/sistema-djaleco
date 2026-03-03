import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Pedido = Tables<"pedidos">;
export type PedidoItem = Tables<"pedido_itens">;

export function usePedidos() {
  return useQuery({
    queryKey: ["pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function usePedido(id: string | undefined) {
  return useQuery({
    queryKey: ["pedidos", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function usePedidoItens(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido_itens", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_itens")
        .select("*")
        .eq("pedido_id", pedidoId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreatePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedido: TablesInsert<"pedidos">) => {
      const { data, error } = await supabase.from("pedidos").insert(pedido).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

export function useUpdatePedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"pedidos"> & { id: string }) => {
      const { data, error } = await supabase
        .from("pedidos")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
}

export function useCreatePedidoItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TablesInsert<"pedido_itens">) => {
      const { data, error } = await supabase.from("pedido_itens").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ["pedido_itens", variables.pedido_id] }),
  });
}

export function useDeletePedidoItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pedido_itens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pedido_itens"] }),
  });
}
