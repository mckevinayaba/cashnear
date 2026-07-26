import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";

/**
 * Pure layout route: `/admin/customers`, `/admin/operators`, `/admin/audit`
 * are file-based children of this route (TanStack Router's dot-file
 * convention), so this component must render an Outlet for them to appear
 * at all -- without it, child routes update the URL/title but the parent's
 * own component keeps rendering underneath, since it's the deepest
 * matched component in the tree. The dashboard itself lives at the index
 * route, admin.index.tsx.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: () => requireAdminBeforeLoad(),
  component: () => <Outlet />,
});
