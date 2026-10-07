import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Ban, RefreshCw, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { DeviceRevokeDialog } from "@/components/platform/device-revoke-dialog";
import {
  DeviceStatusBadge,
  formatDeviceDate,
  maskDeviceId,
  platformLabel,
} from "@/components/platform/device-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui-kit";
import type {
  PlatformAdminRegisteredDevice,
  PlatformAdminRegisteredDeviceListQuery,
  PlatformDeviceLifecycleReason,
  PlatformRegisteredDevicePlatform,
  PlatformRegisteredDeviceStatus,
} from "@/domains/platform/api";
import {
  useAdminRegisteredDevices,
  useRevokeRegisteredDeviceMutation,
} from "@/domains/platform/queries";
import { useAuth } from "@/lib/auth";
import { toastApiError, useApiRouteEnabled } from "@/shared/api";

export const Route = createFileRoute("/_app/admin-settings/devices")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("hawkaii_session");
      const role = raw ? (JSON.parse(raw).role as string | null) : null;
      if (role && role !== "main_admin") {
        throw redirect({ to: "/admin-settings" });
      }
    } catch (error) {
      if ((error as { isRedirect?: boolean })?.isRedirect) throw error;
    }
  },
  component: AdminDevicesScreen,
});

type StatusFilter = PlatformRegisteredDeviceStatus | "all";
type PlatformFilter = PlatformRegisteredDevicePlatform | "all";
type AdminDeviceRow = PlatformAdminRegisteredDevice & {
  id: string;
  employee: string;
};

const PAGE_SIZE = 25;

function AdminDevicesScreen() {
  const { activeRole } = useAuth();
  const isMain = activeRole === "main_admin";
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [sort, setSort] =
    useState<NonNullable<PlatformAdminRegisteredDeviceListQuery["sort"]>>("updated_at_desc");
  const [page, setPage] = useState(1);
  const [deviceToRevoke, setDeviceToRevoke] =
    useState<PlatformAdminRegisteredDevice | null>(null);
  const revokeDevice = useRevokeRegisteredDeviceMutation();

  const query = useMemo<PlatformAdminRegisteredDeviceListQuery>(
    () => ({
      page,
      page_size: PAGE_SIZE,
      q: q.trim() || undefined,
      status: status === "all" ? undefined : status,
      platform: platform === "all" ? undefined : platform,
      sort,
    }),
    [page, platform, q, sort, status],
  );
  const devicesQuery = useAdminRegisteredDevices(query, apiEnabled && isMain);
  const rows = useMemo<AdminDeviceRow[]>(
    () =>
      (devicesQuery.data?.items ?? []).map((device) => ({
        ...device,
        id: device.registered_device_id,
        employee: `${device.owner.employee_code} ${device.owner.full_name}`,
      })),
    [devicesQuery.data?.items],
  );
  const total = devicesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!isMain) {
    return <Navigate to="/admin-settings" />;
  }

  const columns: Column<AdminDeviceRow>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.owner.full_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.owner.employee_code}</p>
        </div>
      ),
    },
    {
      key: "platform",
      header: "Platform",
      render: (row) => platformLabel(row.platform),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <DeviceStatusBadge status={row.status} />,
    },
    {
      key: "created_at",
      header: "Registered",
      render: (row) => <span className="whitespace-nowrap">{formatDeviceDate(row.created_at)}</span>,
    },
    {
      key: "status_changed_at",
      header: "Status changed",
      render: (row) => (
        <span className="whitespace-nowrap">{formatDeviceDate(row.status_changed_at)}</span>
      ),
    },
    {
      key: "registered_device_id",
      header: "Device",
      render: (row) => <span className="whitespace-nowrap">{maskDeviceId(row.registered_device_id)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (row) => (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full text-destructive hover:text-destructive"
          disabled={row.status === "revoked"}
          onClick={() => setDeviceToRevoke(row)}
        >
          <Ban className="mr-2 h-4 w-4" />
          Revoke
        </Button>
      ),
    },
  ];

  async function handleRevoke(reason?: PlatformDeviceLifecycleReason) {
    if (!deviceToRevoke) return;
    try {
      await revokeDevice.mutateAsync({
        deviceId: deviceToRevoke.registered_device_id,
        input: reason ? { reason } : {},
      });
      toast.success("Device revoked");
      setDeviceToRevoke(null);
    } catch (error) {
      toastApiError(error, "Device could not be revoked.");
    }
  }

  function resetPageAnd<T>(setter: (value: T) => void, value: T) {
    setPage(1);
    setter(value);
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">Device management</p>
                <p className="text-xs text-muted-foreground">
                  Admin-only view of registered mobile devices in the active company.
                </p>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={devicesQuery.isFetching}
            onClick={() => devicesQuery.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => resetPageAnd(setQ, event.target.value)}
              placeholder="Search employee code or name"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(value) => resetPageAnd(setStatus, value as StatusFilter)}>
            <SelectTrigger aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={platform}
            onValueChange={(value) => resetPageAnd(setPlatform, value as PlatformFilter)}
          >
            <SelectTrigger aria-label="Platform filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All platforms</SelectItem>
              <SelectItem value="ios">iOS</SelectItem>
              <SelectItem value="android">Android</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(value) =>
              resetPageAnd(
                setSort,
                value as NonNullable<PlatformAdminRegisteredDeviceListQuery["sort"]>,
              )
            }
          >
            <SelectTrigger aria-label="Sort devices">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at_desc">Recently updated</SelectItem>
              <SelectItem value="status_changed_at_desc">Status changed</SelectItem>
              <SelectItem value="employee_code_asc">Employee code</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {apiEnabled ? (
        <>
          <DataTable<AdminDeviceRow>
            rows={rows}
            columns={columns}
            loading={devicesQuery.isLoading}
            hideToolbar
            emptyTitle={devicesQuery.error ? "Devices could not be loaded" : "No devices found"}
            emptyDescription={
              devicesQuery.error
                ? "The backend device inventory API returned an error."
                : "Change the filters or register a mobile device to populate this inventory."
            }
          />
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              {total === 0
                ? "No devices"
                : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page <= 1 || devicesQuery.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-medium">
                Page {page} of {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page >= totalPages || devicesQuery.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <Card className="rounded-2xl border-border/60 p-6 text-sm text-muted-foreground">
          Device management requires backend API mode.
        </Card>
      )}

      <DeviceRevokeDialog
        open={Boolean(deviceToRevoke)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeviceToRevoke(null);
        }}
        device={deviceToRevoke}
        ownerLabel={
          deviceToRevoke
            ? `${deviceToRevoke.owner.full_name} (${deviceToRevoke.owner.employee_code})`
            : undefined
        }
        isPending={revokeDevice.isPending}
        onConfirm={handleRevoke}
      />
    </div>
  );
}
