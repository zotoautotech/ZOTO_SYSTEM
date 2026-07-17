import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ModuleHome } from "./pages/ModuleHome";
import { PlaceholderModule } from "./pages/PlaceholderModule";
import { Login } from "./pages/Login";
import { useAuth } from "./lib/auth";
import { OrderPunchList } from "./modules/order-punch/OrderPunchList";
import { OrderPunchForm } from "./modules/order-punch/OrderPunchForm";
import { OrderDetail } from "./modules/order-punch/OrderDetail";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<ModuleHome />} />
        <Route path="modules/punch-order" element={<OrderPunchList />} />
        <Route path="modules/punch-order/new" element={<OrderPunchForm />} />
        <Route path="modules/punch-order/:orderId" element={<OrderDetail />} />
        <Route path="modules/:moduleKey" element={<PlaceholderModule />} />
      </Route>
    </Routes>
  );
}
