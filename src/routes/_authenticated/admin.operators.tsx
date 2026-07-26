import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";

/**
 * Pure layout route: `/admin/operators/:id` is a file-based child of this
 * route, so this component must render an Outlet for it to appear at all --
 * see admin.tsx for the same pattern and why it's required. The queue list
 * itself lives at the index route, admin.operators.index.tsx.
 */
export const Route = createFileRoute("/_authenticated/admin/operators")({
  beforeLoad: () => requireAdminBeforeLoad(),
  component: () => <Outlet />,
});
