import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Vendedor = Tables<"vendedores">;

export function useVendedores() {
  return useQuery({
    queryKey: ["vendedores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendedores").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TablesInsert<"vendedores">) => {
      const { data, error } = await supabase.from("vendedores").insert(v).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendedores"] }),
  });
}

export function useUpdateVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"vendedores"> & { id: string }) => {
      const { data, error } = await supabase
        .from("vendedores")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendedores"] }),
  });
}

export function useDeleteVendedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendedores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendedores"] }),
  });
}
