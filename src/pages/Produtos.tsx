import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Palette, Ruler } from "lucide-react";

interface Product {
  id: number;
  name: string;
  image: string | null;
  colors: string[];
  sizes: string[];
  variant_count: number;
}

function useProdutos() {
  return useQuery<Product[]>({
    queryKey: ["nuvemshop-products"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nuvemshop-products");
      if (error) throw error;
      return data as Product[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <Package className="h-12 w-12 text-muted-foreground/40" />
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium leading-tight line-clamp-2">{product.name}</h3>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {product.variant_count} var
          </Badge>
        </div>

        {product.colors.length > 0 && (
          <Select>
            <SelectTrigger className="h-8 text-xs">
              <Palette className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder={`${product.colors.length} cores`} />
            </SelectTrigger>
            <SelectContent>
              {product.colors.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {product.sizes.length > 0 && (
          <Select>
            <SelectTrigger className="h-8 text-xs">
              <Ruler className="h-3 w-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder={`${product.sizes.length} tamanhos`} />
            </SelectTrigger>
            <SelectContent>
              {product.sizes.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </Card>
  );
}

export default function Produtos() {
  const { data: products, isLoading, error } = useProdutos();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Produtos</h1>
          {products && (
            <Badge variant="outline">{products.length} produtos</Badge>
          )}
        </div>

        {error && (
          <div className="text-sm text-destructive">
            Erro ao carregar produtos: {(error as Error).message}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="aspect-square w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {products?.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
