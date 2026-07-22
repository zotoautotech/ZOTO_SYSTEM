import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ModuleHome } from "./pages/ModuleHome";
import { ComingSoon } from "./pages/ComingSoon";
import { PlaceholderModule } from "./pages/PlaceholderModule";
import { Login } from "./pages/Login";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfUse } from "./pages/TermsOfUse";
import { Settings } from "./pages/Settings";
import { useAuth } from "./lib/auth";
import { OrderPunchList } from "./modules/order-punch/OrderPunchList";
import { OrderPunchForm } from "./modules/order-punch/OrderPunchForm";
import { OrderDetail } from "./modules/order-punch/OrderDetail";
import { OrderItemsView } from "./modules/order-punch/OrderItemsView";
import { OrderItemDetail } from "./modules/order-punch/OrderItemDetail";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-use" element={<TermsOfUse />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<ComingSoon />} />
        <Route path="settings" element={<Settings />} />
        <Route path="modules" element={<ModuleHome />} />
        <Route path="modules/punch-order" element={<OrderPunchList />} />
        <Route path="modules/sale-order" element={<OrderPunchList hideCreate />} />
        <Route path="modules/punch-order/new" element={<OrderPunchForm />} />
        <Route path="modules/punch-order/:orderId" element={<OrderDetail />} />
        <Route path="modules/punch-order/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/punch-order/:orderId/items/:itemId" element={<OrderItemDetail />} />
        <Route path="modules/sale-order/:orderId" element={<OrderDetail />} />
        <Route path="modules/sale-order/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/sale-order/:orderId/items/:itemId" element={<OrderItemDetail />} />
        <Route path="modules/:moduleKey" element={<PlaceholderModule />} />
      </Route>
    </Routes>
  );
}
