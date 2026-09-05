import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ModuleHome } from "./pages/ModuleHome";
import { Home } from "./pages/Home";
import { ComingSoon } from "./pages/ComingSoon";
import { PlaceholderModule } from "./pages/PlaceholderModule";
import { Login } from "./pages/Login";
import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsOfUse } from "./pages/TermsOfUse";
import { Settings } from "./pages/Settings";
import { PermissionAudit } from "./pages/PermissionAudit";
import { useAuth } from "./lib/auth";
import { OrderPunchList } from "./modules/order-punch/OrderPunchList";
import { OrderPunchForm } from "./modules/order-punch/OrderPunchForm";
import { OrderDetail } from "./modules/order-punch/OrderDetail";
import { OrderItemsView } from "./modules/order-punch/OrderItemsView";
import { OrderItemDetail } from "./modules/order-punch/OrderItemDetail";
import { SoConfirmationList } from "./modules/so-confirmation/SoConfirmationList";
import { DispatchApprovalList } from "./modules/dispatch-approval/DispatchApprovalList";
import { DispatchApprovalItemDetail } from "./modules/dispatch-approval/DispatchApprovalItemDetail";
import { StageQueueList } from "./components/stage/StageQueueList";
import { PdiList } from "./modules/stage/PdiList";
import { PdiItemDetail } from "./modules/stage/PdiItemDetail";
import { STAGES } from "./lib/stages";
import { TripQueueList } from "./components/stage/TripQueueList";
import { TripDetail } from "./modules/transport/TripDetail";
import { TransportList } from "./modules/transport/TransportList";
import { TransportItemDetail } from "./modules/transport/TransportItemDetail";
import { TripSubTableView } from "./modules/transport/TripSubTableView";
import { TRIP_STAGES } from "./lib/tripStages";
import { BulkReachedForm } from "./modules/transport/forms/BulkReachedForm";
import { BulkStockReleaseForm } from "./modules/transport/forms/BulkStockReleaseForm";
import { BulkDispatchForm } from "./modules/transport/forms/BulkDispatchForm";
import { BulkLRForm } from "./modules/transport/forms/BulkLRForm";
import { BulkDeliveryForm } from "./modules/transport/forms/BulkDeliveryForm";
import { Dashboard } from "./modules/dashboard/Dashboard";
import { MyTasksList } from "./checklist/MyTasksList";
import { AssignedChecklistList } from "./checklist/AssignedChecklistList";
import { DashboardList } from "./checklist/DashboardList";
import { DoerPendingList } from "./checklist/DoerPendingList";
import { AccountDashboardExpand } from "./checklist/AccountDashboardExpand";
import { AccountPendingDataList } from "./checklist/AccountPendingDataList";
import { ImsHome } from "./ims/ImsHome";
import { ImsMastersList } from "./ims/ImsMastersList";
import { ImsStockRecordEntry } from "./ims/ImsStockRecordEntry";
import { ImsRacksList } from "./ims/ImsRacksList";
import { NpdHome } from "./npd/NpdHome";
import { BomBuilder } from "./npd/BomBuilder";
import { RmSkuCatalog } from "./npd/RmSkuCatalog";
import { RmSkuDetail } from "./npd/RmSkuDetail";
import { FgSkuCatalog } from "./npd/FgSkuCatalog";
import { FgSkuDetail } from "./npd/FgSkuDetail";
import { RmSearch } from "./npd/RmSearch";
import { FgSearch } from "./npd/FgSearch";
import { AssembleData } from "./npd/AssembleData";

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
        <Route index element={<Home />} />
        <Route path="home/:view" element={<ComingSoon />} />
        <Route path="settings" element={<Settings />} />
        <Route path="settings/permission-audit" element={<PermissionAudit />} />
        <Route path="checklist" element={<MyTasksList />} />
        <Route path="checklist/assigned" element={<AssignedChecklistList />} />
        <Route path="checklist/dashboard" element={<DashboardList />} />
        <Route path="checklist/dashboard/account" element={<AccountDashboardExpand />} />
        <Route path="checklist/dashboard/account/data" element={<AccountPendingDataList />} />
        <Route path="ims" element={<ImsHome />} />
        <Route path="ims/masters/:type" element={<ImsMastersList />} />
        <Route path="ims/stock/:type" element={<ImsStockRecordEntry />} />
        <Route path="ims/racks" element={<ImsRacksList />} />
        <Route path="npd" element={<NpdHome />} />
        <Route path="npd/bom" element={<BomBuilder />} />
        <Route path="npd/bom/:fgId" element={<BomBuilder />} />
        <Route path="npd/rm-sku" element={<RmSkuCatalog />} />
        <Route path="npd/rm-sku/:id" element={<RmSkuDetail />} />
        <Route path="npd/fg-sku" element={<FgSkuCatalog />} />
        <Route path="npd/fg-sku/:id" element={<FgSkuDetail />} />
        <Route path="npd/rm-search" element={<RmSearch />} />
        <Route path="npd/fg-search" element={<FgSearch />} />
        <Route path="npd/assemble-data" element={<AssembleData />} />
        <Route path="checklist/dashboard/:doerId" element={<DoerPendingList />} />
        <Route path="modules" element={<ModuleHome />} />
        <Route path="modules/dashboard" element={<Dashboard />} />
        <Route path="modules/punch-order" element={<OrderPunchList />} />
        <Route path="modules/sale-order" element={<OrderPunchList hideCreate />} />
        <Route path="modules/punch-order/new" element={<OrderPunchForm />} />
        {/* Declared before the ":orderId" detail route below so "edit" isn't swallowed as
            an order id — same ordering hazard noted in CLAUDE.md's Known gotchas. */}
        <Route path="modules/punch-order/:orderId/edit" element={<OrderPunchForm />} />
        <Route path="modules/punch-order/:orderId" element={<OrderDetail />} />
        <Route path="modules/punch-order/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/punch-order/:orderId/items/:itemId" element={<OrderItemDetail />} />
        {/* The Sale Order list is the same OrderPunchList component, so its Edit action
            builds a /modules/sale-order/... URL — registered here too so it resolves rather
            than dead-ending. Before ":orderId", same ordering reason as punch-order above. */}
        <Route path="modules/sale-order/:orderId/edit" element={<OrderPunchForm />} />
        <Route path="modules/sale-order/:orderId" element={<OrderDetail />} />
        <Route path="modules/sale-order/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/sale-order/:orderId/items/:itemId" element={<OrderItemDetail />} />
        <Route path="modules/so-confirmation" element={<SoConfirmationList />} />
        <Route path="modules/so-confirmation/:orderId" element={<OrderDetail />} />
        <Route path="modules/so-confirmation/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/so-confirmation/:orderId/items/:itemId" element={<OrderItemDetail />} />
        <Route path="modules/dispatch-approval" element={<DispatchApprovalList />} />
        <Route path="modules/dispatch-approval/:orderId" element={<OrderDetail />} />
        <Route path="modules/dispatch-approval/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/dispatch-approval/:orderId/items/:itemId" element={<DispatchApprovalItemDetail />} />
        <Route path="modules/pdi" element={<PdiList />} />
        <Route path="modules/pdi/:orderId/items/:itemId" element={<PdiItemDetail />} />
        {STAGES.filter((stage) => stage.key !== "pdi").map((stage) => (
          <Route key={stage.key} path={`modules/${stage.key}`} element={<StageQueueList stage={stage} />} />
        ))}
        <Route path="modules/transport" element={<TransportList />} />
        <Route path="modules/transport/:orderId/items/:itemId" element={<TransportItemDetail />} />
        <Route path="modules/transport/:transportId" element={<TripDetail />} />
        <Route path="modules/transport/:transportId/dispatches" element={<TripSubTableView kind="dispatches" />} />
        <Route path="modules/transport/:transportId/items" element={<TripSubTableView kind="items" />} />
        {TRIP_STAGES.flatMap((stage) => [
          <Route
            key={`${stage.key}-list`}
            path={`modules/${stage.key}`}
            element={
              <TripQueueList
                moduleKey={stage.key}
                label={stage.label}
                prevStatus={stage.prevStatus}
                nextStatus={stage.nextStatus}
                completionTab={stage.completionTab}
                stageTab={stage.tab}
                completedColumns={stage.completedColumns}
                pendingItemColumns={stage.pendingItemColumns}
                pendingColumns={stage.pendingColumns}
                pendingStatusLabel={stage.pendingStatusLabel}
                {...(stage.key === "transport-reached"
                  ? { bulkForm: BulkReachedForm, bulkFormLabel: "Bulk Transport Reached Form" }
                  : stage.key === "stock-release"
                  ? { bulkForm: BulkStockReleaseForm, bulkFormLabel: "Bulk Stock Release Form" }
                  : stage.key === "dispatch"
                  ? { bulkForm: BulkDispatchForm, bulkFormLabel: "Bulk Dispatch Form" }
                  : stage.key === "collect-lr"
                  ? { bulkForm: BulkLRForm, bulkFormLabel: "Bulk LR Form" }
                  : stage.key === "delivery"
                  ? { bulkForm: BulkDeliveryForm, bulkFormLabel: "Bulk Delivery Form" }
                  : {})}
              />
            }
          />,
          <Route key={`${stage.key}-detail`} path={`modules/${stage.key}/:transportId`} element={<TripDetail />} />,
          <Route key={`${stage.key}-dispatches`} path={`modules/${stage.key}/:transportId/dispatches`} element={<TripSubTableView kind="dispatches" />} />,
          <Route key={`${stage.key}-items`} path={`modules/${stage.key}/:transportId/items`} element={<TripSubTableView kind="items" />} />,
        ])}
        <Route path="modules/:moduleKey/:orderId" element={<OrderDetail />} />
        <Route path="modules/:moduleKey/:orderId/items" element={<OrderItemsView />} />
        <Route path="modules/:moduleKey/:orderId/items/:itemId" element={<OrderItemDetail />} />
        <Route path="modules/:moduleKey" element={<PlaceholderModule />} />
      </Route>
    </Routes>
  );
}
