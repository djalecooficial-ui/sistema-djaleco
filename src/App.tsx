import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthContext, useAuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PWAUpdateDialog } from "@/components/PWAUpdateDialog";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Pedidos from "./pages/Pedidos";
import PedidoDetalhe from "./pages/PedidoDetalhe";
import NovoPedido from "./pages/NovoPedido";
import Producao from "./pages/Producao";
import Produtos from "./pages/Produtos";
import Clientes from "./pages/Clientes";
import ClienteDetalhe from "./pages/ClienteDetalhe";
import Financeiro from "./pages/Financeiro";
import Vendedores from "./pages/Vendedores";
import Sistema from "./pages/Sistema";
import CarrinhosAbandonados from "./pages/CarrinhosAbandonados";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const auth = useAuthProvider();

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pedidos" element={<ProtectedRoute><Pedidos /></ProtectedRoute>} />
        <Route path="/pedidos/novo" element={<ProtectedRoute><NovoPedido /></ProtectedRoute>} />
        <Route path="/pedidos/:id" element={<ProtectedRoute><PedidoDetalhe /></ProtectedRoute>} />
        <Route path="/producao" element={<ProtectedRoute><Producao /></ProtectedRoute>} />
        <Route path="/produtos" element={<ProtectedRoute><Produtos /></ProtectedRoute>} />
        <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
        <Route path="/clientes/:id" element={<ProtectedRoute><ClienteDetalhe /></ProtectedRoute>} />
        <Route path="/financeiro" element={<ProtectedRoute><Financeiro /></ProtectedRoute>} />
        <Route path="/vendedores" element={<ProtectedRoute adminOnly><Vendedores /></ProtectedRoute>} />
        <Route path="/carrinhos-abandonados" element={<ProtectedRoute><CarrinhosAbandonados /></ProtectedRoute>} />
        <Route path="/sistema" element={<ProtectedRoute adminOnly><Sistema /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
