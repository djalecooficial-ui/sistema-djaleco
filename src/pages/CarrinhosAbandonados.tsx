import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, ShoppingCart, RefreshCw, AlertTriangle, CheckCircle2, User, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";

interface AbandonedCheckout {
  id: number;
  token: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  recovery_url: string | null;
  status: "abandoned" | "recovered";
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
  };
  products: {
    name: string;
    quantity: number;
    price: number;
    image: string | null;
    variant: string | null;
  }[];
  subtotal: number;
  shipping_cost: number;
  total: number;
  currency: string;
}

const fetchAbandonedCarts = async (days: number): Promise<AbandonedCheckout[]> => {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/nuvemshop-abandoned?days=${days}`,
    {
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
    throw new Error(err.error || "Erro ao buscar carrinhos abandonados");
  }

  return res.json();
};

export default function CarrinhosAbandonados() {
  const [days, setDays] = useState("30");
  const isMobile = useIsMobile();

  const { data: checkouts, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["abandoned-carts", days],
    queryFn: () => fetchAbandonedCarts(parseInt(days)),
    staleTime: 5 * 60 * 1000,
  });

  const abandoned = checkouts?.filter((c) => c.status === "abandoned") || [];
  const recovered = checkouts?.filter((c) => c.status === "recovered") || [];
  const totalAbandoned = abandoned.reduce((s, c) => s + c.total, 0);
  const totalRecovered = recovered.reduce((s, c) => s + c.total, 0);

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const handleRefresh = () => {
    refetch();
    toast.info("Atualizando carrinhos abandonados...");
  };

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Carrinhos Abandonados</h1>
            <p className="text-sm text-muted-foreground">
              Checkouts não finalizados na Nuvemshop
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Carrinhos</p>
              <p className="text-xl font-bold">{checkouts?.length ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Abandonados</p>
              <p className="text-xl font-bold text-destructive">{abandoned.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Valor Perdido</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totalAbandoned)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Recuperados</p>
              <p className="text-lg font-bold text-green-600">{recovered.length} ({formatCurrency(totalRecovered)})</p>
            </CardContent>
          </Card>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm">{(error as Error).message}</span>
            </CardContent>
          </Card>
        )}

        {/* Desktop Table */}
        {!isLoading && !error && checkouts && !isMobile && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Produtos</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkouts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        Nenhum carrinho abandonado no período
                      </TableCell>
                    </TableRow>
                  )}
                  {checkouts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{c.customer.name}</div>
                        {c.customer.email && (
                          <div className="text-xs text-muted-foreground">{c.customer.email}</div>
                        )}
                        {c.customer.phone && (
                          <div className="text-xs text-muted-foreground">{c.customer.phone}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm max-w-[200px]">
                          {c.products.slice(0, 2).map((p, i) => (
                            <div key={i} className="truncate">
                              {p.quantity}x {p.name}
                              {p.variant && <span className="text-muted-foreground"> ({p.variant})</span>}
                            </div>
                          ))}
                          {c.products.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{c.products.length - 2} itens</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(c.total)}</TableCell>
                      <TableCell>
                        {c.status === "recovered" ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Recuperado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" /> Abandonado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.customer.phone && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              asChild
                            >
                              <a
                                href={`https://wa.me/${c.customer.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                              >
                                <Phone className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {c.recovery_url && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={c.recovery_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" /> Link
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Mobile Cards */}
        {!isLoading && !error && checkouts && isMobile && (
          <div className="space-y-3">
            {checkouts.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum carrinho abandonado no período
                </CardContent>
              </Card>
            )}
            {checkouts.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.customer.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.created_at)}</p>
                    </div>
                    {c.status === "recovered" ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">Recuperado</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Abandonado</Badge>
                    )}
                  </div>

                  <div className="text-sm space-y-1">
                    {c.products.slice(0, 3).map((p, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate mr-2">{p.quantity}x {p.name}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{formatCurrency(p.price * p.quantity)}</span>
                      </div>
                    ))}
                    {c.products.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{c.products.length - 3} itens</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-bold">{formatCurrency(c.total)}</span>
                    <div className="flex gap-2">
                      {c.customer.phone && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={`https://wa.me/${c.customer.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Phone className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {c.recovery_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={c.recovery_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" /> Recuperar
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
