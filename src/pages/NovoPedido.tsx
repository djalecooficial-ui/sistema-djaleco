import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import { useCreatePedido, useCreatePedidoItem, getNextZAPNumber } from "@/hooks/usePedidos";
import { ClipboardPaste, Save, Trash2, Plus, ChevronsUpDown, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface NuvemProduct {
  id: number;
  name: string;
  colors: string[];
  sizes: string[];
  images: string[];
  price: number | null;
}

interface ItemForm {
  nome_produto: string;
  quantidade: number;
  tamanho: string;
  cor: string;
  // track selected product for dropdowns
  _product?: NuvemProduct;
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

function matchLabel(label: string): string | null {
  const n = normalize(label);
  if (/^(NOME|NOME COMPLETO|CLIENTE)$/.test(n)) return "cliente_nome";
  if (/^(CELULAR|TELEFONE|WHATSAPP|CONTATO|TEL|FONE|NUMERO|NUMERO DE CONTATO)$/.test(n)) return "cliente_telefone";
  if (/ENDERECO|RUA|LOGRADOURO/.test(n)) return "endereco";
  if (/^BAIRRO$/.test(n)) return "bairro";
  if (/^CIDADE$/.test(n)) return "cidade";
  if (/^(ESTADO|UF)$/.test(n)) return "estado";
  if (/^CEP$/.test(n)) return "cep";
  if (/CPF|CNPJ|DOCUMENTO/.test(n)) return "documento";
  if (/PROFISS/.test(n)) return "profissao";
  if (/^(PEDIDO|ITENS|PRODUTOS|PRODUTO|ITEMS|ITEM)$/.test(n)) return "pedido";
  if (/^(VALOR|TOTAL|VALOR TOTAL|PRECO|PRECO TOTAL)$/.test(n)) return "valor";
  if (/^(FRETE|ENVIO|ENTREGA)$/.test(n)) return "frete";
  if (/^(OBS|OBSERVA)/.test(n)) return "observacoes";
  return null;
}

function parseWhatsApp(text: string) {
  const result: Record<string, string> = {};
  const lines = text.split("\n");
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const rawLabel = line.substring(0, idx).trim();
    const value = line.substring(idx + 1).trim();
    if (!value) continue;
    const key = matchLabel(rawLabel);
    if (key && !result[key]) result[key] = value;
  }
  return result;
}

function parseItens(pedidoStr: string): ItemForm[] {
  if (!pedidoStr) return [];
  const items: ItemForm[] = [];
  const regex = /(\d+)\s*x\s+/gi;
  const parts: { qty: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(pedidoStr)) !== null) {
    parts.push({ qty: parseInt(m[1], 10), start: m.index + m[0].length });
  }
  for (let i = 0; i < parts.length; i++) {
    const end = i + 1 < parts.length ? pedidoStr.lastIndexOf(",", parts[i + 1].start) : pedidoStr.length;
    const raw = pedidoStr.substring(parts[i].start, end >= parts[i].start ? end : pedidoStr.length).trim().replace(/,\s*$/, "");
    if (!raw) continue;
    let nome = raw;
    let cor = "";
    let tamanho = "";
    const sizeMatch = nome.match(/\s+(PP|P|M|G|GG|XG|XXG|EG|EGG)\s*(?:\((\d+)\))?\s*$/i);
    if (sizeMatch) {
      tamanho = sizeMatch[2] ? `${sizeMatch[1]} (${sizeMatch[2]})` : sizeMatch[1];
      nome = nome.substring(0, sizeMatch.index!).trim();
    }
    const corMatch = nome.match(/\(([^)]+)\)\s*$/);
    if (corMatch) {
      cor = corMatch[1];
      nome = nome.substring(0, corMatch.index!).trim();
    }
    items.push({ nome_produto: nome, quantidade: parts[i].qty, tamanho, cor });
  }
  return items.length ? items : [{ nome_produto: pedidoStr.trim(), quantidade: 1, tamanho: "", cor: "" }];
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    // CPF: XXX.XXX.XXX-XX
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  // CNPJ: XX.XXX.XXX/XXXX-XX
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function useNuvemProducts() {
  return useQuery<NuvemProduct[]>({
    queryKey: ["nuvem-products"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nuvemshop-products");
      if (error) throw error;
      return Array.isArray(data) ? data : (data?.products || []);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function NovoPedido() {
  const navigate = useNavigate();
  const createPedido = useCreatePedido();
  const createItem = useCreatePedidoItem();
  const { data: products = [] } = useNuvemProducts();

  const [whatsappText, setWhatsappText] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefone, setClienteTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cep, setCep] = useState("");
  const [documento, setDocumento] = useState("");
  const [valorBruto, setValorBruto] = useState("");
  const [frete, setFrete] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([{ nome_produto: "", quantidade: 1, tamanho: "", cor: "" }]);
  const [saving, setSaving] = useState(false);
  const [openCombobox, setOpenCombobox] = useState<number | null>(null);

  const handleParse = () => {
    if (!whatsappText.trim()) {
      toast.error("Cole o texto do WhatsApp primeiro");
      return;
    }
    const parsed = parseWhatsApp(whatsappText);
    if (parsed.cliente_nome) setClienteNome(parsed.cliente_nome);
    if (parsed.cliente_telefone) setClienteTelefone(parsed.cliente_telefone);
    if (parsed.endereco) setEndereco(parsed.endereco);
    if (parsed.bairro) setBairro(parsed.bairro);
    if (parsed.cidade) setCidade(parsed.cidade);
    if (parsed.estado) setEstado(parsed.estado);
    if (parsed.cep) setCep(parsed.cep);
    if (parsed.documento) setDocumento(parsed.documento);
    if (parsed.observacoes) setObservacoes(parsed.observacoes);
    if (parsed.pedido) {
      const parsedItens = parseItens(parsed.pedido);
      if (parsedItens.length) setItens(parsedItens);
    }
    if (parsed.valor) setValorBruto(parsed.valor.replace(/[^\d.,]/g, "").replace(",", "."));
    if (parsed.frete) setFrete(parsed.frete.replace(/[^\d.,]/g, "").replace(",", "."));
    toast.success("Dados preenchidos a partir do WhatsApp!");
  };

  const handleAddItem = () => {
    setItens([...itens, { nome_produto: "", quantidade: 1, tamanho: "", cor: "" }]);
  };

  const handleRemoveItem = (idx: number) => {
    setItens(itens.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof ItemForm, value: string | number) => {
    setItens(itens.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSelectProduct = (idx: number, product: NuvemProduct) => {
    setItens(itens.map((item, i) =>
      i === idx ? { ...item, nome_produto: product.name, _product: product, tamanho: "", cor: "" } : item
    ));
    setOpenCombobox(null);
  };

  const handleSave = async () => {
    if (!clienteNome.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!itens.some((i) => i.nome_produto.trim())) {
      toast.error("Adicione pelo menos um item");
      return;
    }

    setSaving(true);
    try {
      const numeroPedido = await getNextZAPNumber();
      const pedido = await createPedido.mutateAsync({
        numero_pedido: numeroPedido,
        cliente_nome: clienteNome.trim(),
        cliente_telefone: clienteTelefone.trim() || null,
        endereco: endereco.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        estado: estado.trim() || null,
        cep: cep.trim() || null,
        origem: "whatsapp",
        valor_bruto: parseFloat(valorBruto) || 0,
        frete: parseFloat(frete) || 0,
        valor_liquido: (parseFloat(valorBruto) || 0) - (parseFloat(frete) || 0),
        etapa_producao: "Planejamento",
        data_pedido: new Date().toISOString(),
        observacoes_pedido: observacoes.trim() || null,
      } as any);

      for (const item of itens.filter((i) => i.nome_produto.trim())) {
        await createItem.mutateAsync({
          pedido_id: pedido.id,
          nome_produto: item.nome_produto.trim(),
          quantidade: item.quantidade,
          tamanho: item.tamanho.trim() || null,
          cor: item.cor.trim() || null,
        });
      }

      toast.success(`Pedido ${numeroPedido} criado!`);
      navigate(`/pedidos/${pedido.id}`);
    } catch (e: any) {
      toast.error("Erro ao criar pedido: " + (e.message || "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6 max-w-3xl">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Novo Pedido</h1>

        {/* WhatsApp paste area */}
        <Card className="p-3 sm:p-4 space-y-3">
          <Label className="text-sm font-semibold">Colar dados do WhatsApp</Label>
          <Textarea
            placeholder={"NOME: João Silva\nCELULAR: (11) 99999-9999\nENDEREÇO COMPLETO: Rua X, 123\n..."}
            rows={6}
            value={whatsappText}
            onChange={(e) => setWhatsappText(e.target.value)}
          />
          <Button variant="outline" size="sm" onClick={handleParse}>
            <ClipboardPaste className="h-4 w-4 mr-2" />
            Preencher formulário
          </Button>
        </Card>

        <Separator />

        {/* Form fields */}
        <Card className="p-3 sm:p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="clienteNome">Nome do Cliente</Label>
              <Input id="clienteNome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clienteTelefone">Celular</Label>
              <Input id="clienteTelefone" value={clienteTelefone} onChange={(e) => setClienteTelefone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="endereco">Endereço Completo</Label>
              <Input id="endereco" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bairro">Bairro</Label>
              <Input id="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estado">Estado</Label>
              <Input id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cep">CEP</Label>
              <Input id="cep" value={cep} onChange={(e) => setCep(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="documento">CPF/CNPJ</Label>
              <Input id="documento" value={documento} onChange={(e) => setDocumento(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valorBruto">Valor Bruto (R$)</Label>
              <Input id="valorBruto" type="number" step="0.01" value={valorBruto} onChange={(e) => setValorBruto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="frete">Frete (R$)</Label>
              <Input id="frete" type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Observações */}
        <Card className="p-3 sm:p-4 space-y-2">
          <Label htmlFor="observacoes" className="text-sm font-semibold">Observações</Label>
          <Textarea
            id="observacoes"
            placeholder="Informações importantes sobre o pedido..."
            rows={3}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </Card>

        {/* Items */}
        <Card className="p-3 sm:p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Itens do Pedido</Label>
            <Button variant="outline" size="sm" onClick={handleAddItem}>
              <Plus className="h-4 w-4 mr-1" /> Item
            </Button>
          </div>

          {itens.map((item, idx) => {
            const selectedProduct = item._product || products.find(p => p.name === item.nome_produto);
            const availableSizes = selectedProduct?.sizes || [];
            const availableColors = selectedProduct?.colors || [];

            return (
              <div key={idx} className="border rounded-lg p-3 space-y-3">
                {/* Product name - combobox */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Produto</Label>
                  <Popover open={openCombobox === idx} onOpenChange={(open) => setOpenCombobox(open ? idx : null)}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal h-10"
                      >
                        <span className="truncate">{item.nome_produto || "Selecionar produto..."}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-3rem)] sm:w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar produto..." />
                        <CommandList>
                          <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => handleSelectProduct(idx, p)}
                              >
                                <Check className={cn("mr-2 h-4 w-4", item.nome_produto === p.name ? "opacity-100" : "opacity-0")} />
                                <span className="flex-1 truncate">{p.name}</span>
                                {p.price != null && <span className="text-xs text-muted-foreground ml-2">R$ {p.price.toFixed(2)}</span>}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Qty + Size + Color row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Qtd</Label>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => handleItemChange(idx, "quantidade", parseInt(e.target.value) || 1)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho</Label>
                    {availableSizes.length > 0 ? (
                      <Select value={item.tamanho} onValueChange={(v) => handleItemChange(idx, "tamanho", v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {availableSizes.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="P, M..."
                        value={item.tamanho}
                        onChange={(e) => handleItemChange(idx, "tamanho", e.target.value)}
                        className="h-9"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cor</Label>
                    {availableColors.length > 0 ? (
                      <Select value={item.cor} onValueChange={(v) => handleItemChange(idx, "cor", v)}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {availableColors.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="Cor"
                        value={item.cor}
                        onChange={(e) => handleItemChange(idx, "cor", e.target.value)}
                        className="h-9"
                      />
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => handleRemoveItem(idx)}
                    disabled={itens.length <= 1}
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Remover
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Salvando..." : "Salvar Pedido"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/pedidos")}>Cancelar</Button>
        </div>
      </div>
    </AppLayout>
  );
}
