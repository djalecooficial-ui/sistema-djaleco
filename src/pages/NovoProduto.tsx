import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const IMAGES_BUCKET = "product-images";

interface Categoria {
  id: number;
  name: string;
  parent: number | null;
}

function useCategorias() {
  return useQuery<Categoria[]>({
    queryKey: ["nuvemshop-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nuvemshop-categories");
      if (error) throw error;
      return data as Categoria[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

function withParentLabels(categorias: Categoria[]): (Categoria & { label: string })[] {
  const byId = new Map(categorias.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const c of categorias) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return categorias.map((c) => {
    const isDuplicateName = (counts.get(c.name) ?? 0) > 1;
    const parent = c.parent ? byId.get(c.parent) : null;
    const label = isDuplicateName && parent ? `${c.name} (${parent.name})` : c.name;
    return { ...c, label };
  });
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function NovoProduto() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data: categorias } = useCategorias();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cores, setCores] = useState("");
  const [tamanhos, setTamanhos] = useState("");
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("10");
  const [categoriasSelecionadas, setCategoriasSelecionadas] = useState<number[]>([]);
  const [imagens, setImagens] = useState<File[]>([]);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const toggleCategoria = (id: number) => {
    setCategoriasSelecionadas((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const onFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) setImagens((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeImagem = (idx: number) => {
    setImagens((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildVariantes = () => {
    const listaCores = splitList(cores);
    const listaTamanhos = splitList(tamanhos);
    const precoFmt = Number(preco.replace(",", ".")).toFixed(2);
    const estoqueNum = Number(estoque) || 0;

    if (listaCores.length && listaTamanhos.length) {
      const variantes = [];
      for (const c of listaCores) {
        for (const t of listaTamanhos) {
          variantes.push({ valores: [c, t], preco: precoFmt, estoque: estoqueNum });
        }
      }
      return { atributos: ["Cor", "Tamanho"], variantes };
    }
    if (listaCores.length) {
      return {
        atributos: ["Cor"],
        variantes: listaCores.map((c) => ({ valores: [c], preco: precoFmt, estoque: estoqueNum })),
      };
    }
    if (listaTamanhos.length) {
      return {
        atributos: ["Tamanho"],
        variantes: listaTamanhos.map((t) => ({ valores: [t], preco: precoFmt, estoque: estoqueNum })),
      };
    }
    return { atributos: [], variantes: [{ valores: [], preco: precoFmt, estoque: estoqueNum }] };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;

    if (!nome.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    const precoNum = Number(preco.replace(",", "."));
    if (!precoNum || precoNum <= 0) {
      toast.error("Informe um preço válido");
      return;
    }

    setSalvando(true);
    try {
      setEtapa(imagens.length ? "Enviando fotos..." : null);
      const urlsImagens: string[] = [];
      for (const file of imagens) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(IMAGES_BUCKET)
          .upload(path, file, { contentType: file.type || "image/jpeg" });
        if (upErr) throw new Error(`Erro ao enviar foto ${file.name}: ${upErr.message}`);
        const { data: pub } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
        urlsImagens.push(pub.publicUrl);
      }

      setEtapa("Cadastrando produto na Nuvemshop...");
      const { atributos, variantes } = buildVariantes();
      const { data, error } = await supabase.functions.invoke("nuvemshop-create-product", {
        body: {
          nome: nome.trim(),
          descricao: descricao.trim(),
          categorias: categoriasSelecionadas,
          atributos,
          variantes,
          imagens: urlsImagens,
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.error) throw new Error(resp.error);

      if (resp?.warnings?.length) {
        toast.warning(`Produto criado, mas com avisos: ${resp.warnings.join(" | ")}`);
      } else {
        toast.success("Produto cadastrado na Nuvemshop!");
      }
      qc.invalidateQueries({ queryKey: ["nuvemshop-products"] });
      navigate("/produtos");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao cadastrar produto");
    } finally {
      setSalvando(false);
      setEtapa(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/produtos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Novo Produto</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do produto</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Jaleco Feminino Flex" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes do produto, tecido, etc." rows={4} />
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Variações</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cores">Cores (separe por vírgula)</Label>
                <Input id="cores" value={cores} onChange={(e) => setCores(e.target.value)} placeholder="Branco, Azul Marinho, Rosa" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tamanhos">Tamanhos (separe por vírgula)</Label>
                <Input id="tamanhos" value={tamanhos} onChange={(e) => setTamanhos(e.target.value)} placeholder="PP, P, M, G, GG" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preco">Preço (mesmo valor para todas as variações)</Label>
                <Input id="preco" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="149,90" inputMode="decimal" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estoque">Estoque por variação</Label>
                <Input id="estoque" type="number" min={0} value={estoque} onChange={(e) => setEstoque(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Se preencher cores e tamanhos, o produto é criado com todas as combinações (ex: 3 cores × 5 tamanhos = 15 variações). Você pode ajustar preço e estoque de cada combinação depois direto na Nuvemshop.
            </p>
          </Card>

          {categorias && categorias.length > 0 && (
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Categorias</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {withParentLabels(categorias).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={categoriasSelecionadas.includes(c.id)}
                      onCheckedChange={() => toggleCategoria(c.id)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Fotos</h2>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onFilesChosen} />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Escolher fotos
            </Button>
            {imagens.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {imagens.map((file, i) => (
                  <div key={i} className="relative aspect-square rounded-md overflow-hidden border">
                    <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImagem(i)}
                      className="absolute top-1 right-1 bg-background/80 rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {salvando ? etapa ?? "Salvando..." : "Cadastrar produto na Nuvemshop"}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
