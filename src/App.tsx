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
const Usuarios = lazy(() => import("./pages/Usuarios"));
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
        <Route path="/" element={<ProtectedRoute pageKey="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="/pedidos" element={<ProtectedRoute pageKey="pedidos"><Pedidos /></ProtectedRoute>} />
        <Route path="/pedidos/novo" element={<ProtectedRoute pageKey="pedidos"><NovoPedido /></ProtectedRoute>} />
        <Route path="/pedidos/:id" element={<ProtectedRoute pageKey="pedidos"><PedidoDetalhe /></ProtectedRoute>} />
        <Route path="/producao" element={<ProtectedRoute pageKey="producao"><Producao /></ProtectedRoute>} />
        <Route path="/produtos" element={<ProtectedRoute pageKey="produtos"><Produtos /></ProtectedRoute>} />
        <Route path="/clientes" element={<ProtectedRoute pageKey="clientes"><Clientes /></ProtectedRoute>} />
        <Route path="/crm" element={<ProtectedRoute pageKey="crm"><CRM /></ProtectedRoute>} />
        <Route path="/crm/base-conhecimento" element={<ProtectedRoute pageKey="crm"><CRMBaseConhecimento /></ProtectedRoute>} />
        <Route path="/crm/anexos" element={<ProtectedRoute pageKey="crm"><CRMAnexos /></ProtectedRoute>} />
        <Route path="/crm/site" element={<ProtectedRoute pageKey="crm"><CRMSite /></ProtectedRoute>} />
        <Route path="/crm/colunas" element={<ProtectedRoute pageKey="crm"><CRMColunas /></ProtectedRoute>} />
        <Route path="/crm/:id" element={<ProtectedRoute pageKey="crm"><CRMContato /></ProtectedRoute>} />
        <Route path="/clientes/:id" element={<ProtectedRoute pageKey="clientes"><ClienteDetalhe /></ProtectedRoute>} />
        <Route path="/financeiro" element={<ProtectedRoute pageKey="financeiro"><Financeiro /></ProtectedRoute>} />
        <Route path="/vendedores" element={<ProtectedRoute adminOnly><Vendedores /></ProtectedRoute>} />
        <Route path="/carrinhos-abandonados" element={<ProtectedRoute pageKey="carrinhos"><CarrinhosAbandonados /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute pageKey="relatorios"><Relatorios /></ProtectedRoute>} />
        <Route path="/sistema" element={<ProtectedRoute adminOnly><Sistema /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute adminOnly><Usuarios /></ProtectedRoute>} />
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
