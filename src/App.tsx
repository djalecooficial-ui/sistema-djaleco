import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthContext, useAuthProvider } from "@/hooks/useAuth";
import { useNewMessageNotifications } from "@/hooks/useNewMessageNotifications";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PWAUpdateDialog } from "@/components/PWAUpdateDialog";
import Login from "./pages/Login";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pedidos = lazy(() => import("./pages/Pedidos"));
const PedidoDetalhe = lazy(() => import("./pages/PedidoDetalhe"));
const NovoPedido = lazy(() => import("./pages/NovoPedido"));
const Producao = lazy(() => import("./pages/Producao"));
const Produtos = lazy(() => import("./pages/Produtos"));
const Clientes = lazy(() => import("./pages/Clientes"));
const CRM = lazy(() => import("./pages/CRM"));
const CRMContato = lazy(() => import("./pages/CRMContato"));
const CRMBaseConhecimento = lazy(() => import("./pages/CRMBaseConhecimento"));
const CRMAnexos = lazy(() => import("./pages/CRMAnexos"));
const CRMSite = lazy(() => import("./pages/CRMSite"));
const CRMColunas = lazy(() => import("./pages/CRMColunas"));
const ClienteDetalhe = lazy(() => import("./pages/ClienteDetalhe"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Vendedores = lazy(() => import("./pages/Vendedores"));
const Sistema = lazy(() => import("./pages/Sistema"));
const CarrinhosAbandonados = lazy(() => import("./pages/CarrinhosAbandonados"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AppRoutes() {
  const auth = useAuthProvider();
  useNewMessageNotifications(!!auth.user);

  return (
    <AuthContext.Provider value={auth}>
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pedidos" element={<ProtectedRoute><Pedidos /></ProtectedRoute>} />
        <Route path="/pedidos/novo" element={<ProtectedRoute><NovoPedido /></ProtectedRoute>} />
        <Route path="/pedidos/:id" element={<ProtectedRoute><PedidoDetalhe /></ProtectedRoute>} />
        <Route path="/producao" element={<ProtectedRoute><Producao /></ProtectedRoute>} />
        <Route path="/produtos" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
        <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute><CRM /></ProtectedRoute>} />
        <Route path="/crm/base-conhecimento" element={<ProtectedRoute><CRMBaseConhecimento /></ProtectedRoute>} />
        <Route path="/crm/anexos" element={<ProtectedRoute><CRMAnexos /></ProtectedRoute>} />
        <Route path="/crm/site" element={<ProtectedRoute><CRMSite /></ProtectedRoute>} />
        <Route path="/crm/colunas" element={<ProtectedRoute><CRMColunas /></ProtectedRoute>} />
        <Route path="/crm/:id" element={<ProtectedRoute><CRMContato /></ProtectedRoute>} />
        <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />
        <Route path="/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
        <Route path="/vendedores" element={<ProtectedRoute adminOnly><Vendedores /></ProtectedRoute>} />
        <Route path="/carrinhos-abandonados" element={<ProtectedRoute><CarrinhosAbandonados /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
        <Route path="/sistema" element={<ProtectedRoute adminOnly><Sistema /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </AuthContext.Provider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAUpdateDialog />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
