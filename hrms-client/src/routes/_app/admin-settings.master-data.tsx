import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column, ActionButton, Modal, SearchFilterBar } from "@/components/ui-kit";
import {
  useAdminSettings,
  MASTER_LABELS,
  type MasterKey,
  type MasterRow,
} from "@/lib/admin-settings-store";
import { ApiError, toastApiError, useApiRouteEnabled, userFacingErrorMessage } from "@/shared/api";
import {
  useCreateDepartmentMasterMutation,
  useCreateDesignationMasterMutation,
  useCreateExtendedMasterDataMutation,
  useDepartmentMastersPage,
  useDesignationMastersPage,
  useExtendedMasterData,
  useUpdateDepartmentMasterMutation,
  useUpdateDesignationMasterMutation,
  useUpdateExtendedMasterDataMutation,
} from "@/domains/admin/queries";
import {
  departmentParentPatch,
  designationLevelPatch,
  selectableDepartmentParents,
} from "@/domains/admin/master-data-helpers";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const KEYS: MasterKey[] = [
  "departments",
  "designations",
  "employmentTypes",
  "workLocations",
  "shifts",
  "leaveTypes",
  "expenseCategories",
  "assetCategories",
  "helpdeskCategories",
  "projectRoles",
];

interface SearchParams {
  tab?: MasterKey;
  page?: number;
  q?: string;
}

const toMasterKey = (value: unknown): MasterKey | undefined => {
  return typeof value === "string" && KEYS.includes(value as MasterKey)
    ? (value as MasterKey)
    : undefined;
};

export const Route = createFileRoute("/_app/admin-settings/master-data")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    tab: toMasterKey(s.tab),
    page: typeof s.page === "number" && Number.isInteger(s.page) && s.page > 1 ? s.page : undefined,
    q: typeof s.q === "string" && s.q.trim() ? s.q.slice(0, 160) : undefined,
  }),
  component: MasterDataScreen,
});

type CoreApiMasterKey = "departments" | "designations";
type ExtendedApiMasterKey = Exclude<MasterKey, CoreApiMasterKey>;
type ApiMasterKey = CoreApiMasterKey | ExtendedApiMasterKey;
type ApiMasterRow = MasterRow & {
  code: string;
  version: number;
  apiKind: ApiMasterKey;
  sortOrder?: number;
  parentId?: string | null;
  parentName?: string | null;
  level?: number | null;
};

const EXTENDED_MASTER_KEYS: readonly ExtendedApiMasterKey[] = [
  "employmentTypes",
  "workLocations",
  "shifts",
  "leaveTypes",
  "expenseCategories",
  "assetCategories",
  "helpdeskCategories",
  "projectRoles",
];

const API_MASTER_KEYS: readonly ApiMasterKey[] = [...KEYS];
const CORE_MASTER_KEYS: readonly CoreApiMasterKey[] = ["departments", "designations"];

interface MasterFormState {
  name: string;
  description: string;
  parentDepartmentId: string;
  designationLevel: string;
}

const EMPTY_FORM: MasterFormState = {
  name: "",
  description: "",
  parentDepartmentId: "",
  designationLevel: "",
};

function MasterDataScreen() {
  const { masters, addMaster, updateMaster, toggleMasterActive, deleteMaster } = useAdminSettings();
  const navigate = useNavigate();
  const search = Route.useSearch();
  let activeKey: MasterKey = toMasterKey(search.tab) ?? "departments";
  const apiEnabled = useApiRouteEnabled(["/admin-settings"]);
  const requestedKey = activeKey;
  if (apiEnabled && !CORE_MASTER_KEYS.includes(requestedKey as CoreApiMasterKey)) {
    activeKey = "departments";
  }
  const page = search.page ?? 1;
  const serverSearch = search.q ?? "";
  const [parentSearch, setParentSearch] = useState("");
  const debouncedParentSearch = useDebouncedValue(parentSearch);
  const pageParams = {
    page,
    page_size: 25,
    ...(serverSearch.trim() ? { search: serverSearch.trim() } : {}),
  };
  const departmentsQuery = useDepartmentMastersPage(
    pageParams,
    apiEnabled && activeKey === "departments",
  );
  const designationsQuery = useDesignationMastersPage(
    pageParams,
    apiEnabled && activeKey === "designations",
  );
  // Extended masters are still globally shared on the current backend. Keep them
  // available only in local mock mode until their tenant-owned contract lands.
  const employmentTypesQuery = useExtendedMasterData("employmentTypes", false);
  const workLocationsQuery = useExtendedMasterData("workLocations", false);
  const shiftsQuery = useExtendedMasterData("shifts", false);
  const leaveTypesQuery = useExtendedMasterData("leaveTypes", false);
  const expenseCategoriesQuery = useExtendedMasterData("expenseCategories", false);
  const assetCategoriesQuery = useExtendedMasterData("assetCategories", false);
  const helpdeskCategoriesQuery = useExtendedMasterData("helpdeskCategories", false);
  const projectRolesQuery = useExtendedMasterData("projectRoles", false);
  const createDepartment = useCreateDepartmentMasterMutation();
  const updateDepartment = useUpdateDepartmentMasterMutation();
  const createDesignation = useCreateDesignationMasterMutation();
  const updateDesignation = useUpdateDesignationMasterMutation();
  const createExtendedMaster = useCreateExtendedMasterDataMutation();
  const updateExtendedMaster = useUpdateExtendedMasterDataMutation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [form, setForm] = useState<MasterFormState>(EMPTY_FORM);
  const [latestConflict, setLatestConflict] = useState<ApiMasterRow | null>(null);
  const submissionInFlight = useRef(false);
  const statusMutationInFlight = useRef(false);
  const visibleKeys = apiEnabled ? (["departments", "designations"] as const) : KEYS;
  const parentDepartmentsQuery = useDepartmentMastersPage(
    {
      page: 1,
      page_size: 25,
      active_only: true,
      ...(editing && activeKey === "departments" ? { parent_candidate_for: editing.id } : {}),
      ...(debouncedParentSearch.trim() ? { search: debouncedParentSearch.trim() } : {}),
    },
    apiEnabled && activeKey === "departments" && open,
  );

  useEffect(() => {
    if (apiEnabled && requestedKey !== activeKey) {
      void navigate({
        to: "/admin-settings/master-data",
        search: { tab: "departments", page: undefined, q: undefined },
        replace: true,
      });
    }
  }, [activeKey, apiEnabled, navigate, requestedKey]);

  const departmentRows = useMemo<ApiMasterRow[]>(() => {
    const source = departmentsQuery.data?.items ?? [];
    return source.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.code,
      meta: row.parent_department_id
        ? `${row.code} · Parent: ${row.parent_department_name ?? "Unavailable"}`
        : `${row.code} · Top level`,
      active: row.active,
      code: row.code,
      version: row.version,
      apiKind: "departments",
      parentId: row.parent_department_id,
      parentName: row.parent_department_name,
    }));
  }, [departmentsQuery.data?.items]);
  const designationRows = useMemo<ApiMasterRow[]>(
    () =>
      (designationsQuery.data?.items ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.code,
        meta: row.level == null ? row.code : `${row.code} · Level ${row.level}`,
        active: row.active,
        code: row.code,
        version: row.version,
        apiKind: "designations",
        level: row.level,
      })),
    [designationsQuery.data?.items],
  );
  const extendedQueries: Record<ExtendedApiMasterKey, ReturnType<typeof useExtendedMasterData>> = {
    employmentTypes: employmentTypesQuery,
    workLocations: workLocationsQuery,
    shifts: shiftsQuery,
    leaveTypes: leaveTypesQuery,
    expenseCategories: expenseCategoriesQuery,
    assetCategories: assetCategoriesQuery,
    helpdeskCategories: helpdeskCategoriesQuery,
    projectRoles: projectRolesQuery,
  };
  const parentOptions = useMemo(
    () =>
      selectableDepartmentParents(
        (parentDepartmentsQuery.data?.items ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          active: row.active,
          parentId: row.parent_department_id,
        })),
        null,
      ),
    [parentDepartmentsQuery.data?.items],
  );

  const startAdd = () => {
    if (!canMutate(activeKey)) return;
    setEditing(null);
    setLatestConflict(null);
    setParentSearch("");
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const startEdit = (row: MasterRow) => {
    if (!canMutate(activeKey)) return;
    const apiRow = row as ApiMasterRow;
    setEditing(row);
    setLatestConflict(null);
    setParentSearch("");
    setForm({
      name: row.name,
      description: row.description ?? "",
      parentDepartmentId: apiRow.parentId ?? "",
      designationLevel: apiRow.level == null ? "" : String(apiRow.level),
    });
    setOpen(true);
  };

  const setActiveKey = (key: MasterKey) => {
    setOpen(false);
    setEditing(null);
    setLatestConflict(null);
    setParentSearch("");
    void navigate({
      to: "/admin-settings/master-data",
      search: { tab: key, page: undefined, q: undefined },
      replace: true,
    });
  };

  const onSave = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (submissionInFlight.current || latestConflict) return;
    submissionInFlight.current = true;
    try {
      if (apiEnabled && isApiMasterKey(activeKey)) {
        await saveApiMaster();
      } else if (editing) {
        updateMaster(activeKey, editing.id, { name: form.name, description: form.description });
        toast.success(`${MASTER_LABELS[activeKey].replace(/s$/, "")} updated`);
      } else {
        addMaster(activeKey, form.name, form.description);
        toast.success(`Added to ${MASTER_LABELS[activeKey]}`);
      }
      submissionInFlight.current = false;
      setOpen(false);
    } catch (error) {
      const current = editing as ApiMasterRow | null;
      const stale =
        Boolean(current) &&
        error instanceof ApiError &&
        error.status === 409 &&
        error.details?.aggregate === (activeKey === "departments" ? "department" : "designation");
      if (stale && current) {
        const conflictVersion =
          typeof error.details?.current_version === "number" &&
          Number.isInteger(error.details.current_version) &&
          error.details.current_version > 0
            ? error.details.current_version
            : null;
        if (activeKey === "departments") {
          const refreshed = await departmentsQuery.refetch();
          const latest = refreshed.data?.items.find((item) => item.id === current.id);
          if (latest || conflictVersion) {
            setLatestConflict({
              ...current,
              version: latest?.version ?? conflictVersion!,
              parentId: latest?.parent_department_id ?? current.parentId,
              parentName: latest?.parent_department_name ?? current.parentName,
            });
          }
        } else {
          const refreshed = await designationsQuery.refetch();
          const latest = refreshed.data?.items.find((item) => item.id === current.id);
          if (latest || conflictVersion) {
            setLatestConflict({
              ...current,
              version: latest?.version ?? conflictVersion!,
              level: latest?.level ?? current.level,
            });
          }
        }
        toast.error(
          "This record changed after you opened it. Review your draft, then retry against the latest version.",
        );
      } else {
        if (apiEnabled && CORE_MASTER_KEYS.includes(activeKey as CoreApiMasterKey)) {
          await refetchFor(activeKey as CoreApiMasterKey);
        }
        toast.error(
          `${userFacingErrorMessage(error)} Your draft was kept. Check the refreshed list before retrying.`,
        );
      }
      submissionInFlight.current = false;
    }
  };

  const mutationPending =
    createDepartment.isPending ||
    updateDepartment.isPending ||
    createDesignation.isPending ||
    updateDesignation.isPending ||
    createExtendedMaster.isPending ||
    updateExtendedMaster.isPending;
  const activePage = activeKey === "departments" ? departmentsQuery.data : designationsQuery.data;
  const totalPages = Math.max(1, Math.ceil((activePage?.total ?? 0) / 25));

  useEffect(() => {
    if (!apiEnabled || !activePage || page <= totalPages) return;
    void navigate({
      to: "/admin-settings/master-data",
      search: {
        tab: activeKey,
        page: totalPages > 1 ? totalPages : undefined,
        q: serverSearch || undefined,
      },
      replace: true,
    });
  }, [activeKey, activePage, apiEnabled, navigate, page, serverSearch, totalPages]);

  const columns = (key: MasterKey): Column<MasterRow>[] => [
    {
      key: "id",
      header: "ID",
      render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span>,
    },
    { key: "name", header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "meta",
      header: "Details",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.meta ?? r.description ?? "—"}</span>
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (r) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={r.active}
            disabled={!canMutate(key) || mutationPending}
            aria-label={`${r.active ? "Deactivate" : "Activate"} ${r.name}`}
            onCheckedChange={() => void toggleActive(key, r)}
          />
          <span className="text-xs">{r.active ? "Active" : "Inactive"}</span>
        </div>
      ),
    },
  ];

  function isApiMasterKey(key: MasterKey): key is ApiMasterKey {
    return API_MASTER_KEYS.includes(key as ApiMasterKey);
  }

  function canMutate(key: MasterKey): boolean {
    return !apiEnabled || isApiMasterKey(key);
  }

  function rowsFor(key: MasterKey): MasterRow[] {
    if (!apiEnabled) return masters[key];
    if (key === "departments") return departmentRows;
    if (key === "designations") return designationRows;
    if (isExtendedApiMasterKey(key)) return extendedRowsFor(key);
    return [];
  }

  function loadingFor(key: MasterKey): boolean {
    if (!apiEnabled) return false;
    if (key === "departments") return departmentsQuery.isLoading;
    if (key === "designations") return designationsQuery.isLoading;
    if (isExtendedApiMasterKey(key)) return extendedQueries[key].isLoading;
    return false;
  }

  function errorFor(key: MasterKey): Error | null {
    if (!apiEnabled) return null;
    if (key === "departments")
      return departmentsQuery.error instanceof Error ? departmentsQuery.error : null;
    if (key === "designations")
      return designationsQuery.error instanceof Error ? designationsQuery.error : null;
    if (isExtendedApiMasterKey(key)) {
      const error = extendedQueries[key].error;
      return error instanceof Error ? error : null;
    }
    return null;
  }

  function refetchFor(key: CoreApiMasterKey) {
    if (key === "departments") return departmentsQuery.refetch();
    return designationsQuery.refetch();
  }

  function isExtendedApiMasterKey(key: MasterKey): key is ExtendedApiMasterKey {
    return EXTENDED_MASTER_KEYS.includes(key as ExtendedApiMasterKey);
  }

  function extendedRowsFor(key: ExtendedApiMasterKey): ApiMasterRow[] {
    return (extendedQueries[key].data?.items ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      meta: row.description ? `${row.code} · ${row.description}` : row.code,
      active: row.active,
      code: row.code,
      version: row.version,
      apiKind: key,
      sortOrder: row.sort_order,
    }));
  }

  async function saveApiMaster() {
    const code = normalizeCode(form.description || form.name);
    if (code.length < 2)
      throw new Error("Enter a code containing at least two letters or numbers.");
    if (activeKey === "departments") {
      const current = editing as ApiMasterRow | null;
      if (current) {
        await updateDepartment.mutateAsync({
          id: current.id,
          input: {
            name: form.name,
            code,
            expected_version: current.version,
            ...departmentParentPatch(form.parentDepartmentId, current.parentId ?? null, true),
          },
        });
        toast.success("Department updated");
      } else {
        await createDepartment.mutateAsync({
          name: form.name,
          code,
          ...departmentParentPatch(form.parentDepartmentId, null, false),
        });
        toast.success("Department added");
      }
      return;
    }

    if (activeKey === "designations") {
      const current = editing as ApiMasterRow | null;
      if (current) {
        await updateDesignation.mutateAsync({
          id: current.id,
          input: {
            title: form.name,
            code,
            expected_version: current.version,
            ...designationLevelPatch(form.designationLevel, current.level ?? null, true),
          },
        });
        toast.success("Designation updated");
      } else {
        await createDesignation.mutateAsync({
          title: form.name,
          code,
          ...designationLevelPatch(form.designationLevel, null, false),
        });
        toast.success("Designation added");
      }
      return;
    }

    if (isExtendedApiMasterKey(activeKey)) {
      const current = editing as ApiMasterRow | null;
      const extendedCode = normalizeCode(current?.code || form.name);
      const description = form.description.trim() || null;
      if (current) {
        await updateExtendedMaster.mutateAsync({
          masterKey: activeKey,
          id: current.id,
          input: {
            name: form.name,
            code: extendedCode,
            description,
            expected_version: current.version,
          },
        });
        toast.success(`${MASTER_LABELS[activeKey].replace(/s$/, "")} updated`);
      } else {
        await createExtendedMaster.mutateAsync({
          masterKey: activeKey,
          input: { name: form.name, code: extendedCode, description },
        });
        toast.success(`Added to ${MASTER_LABELS[activeKey]}`);
      }
      return;
    }

    const current = editing as ApiMasterRow | null;
    if (current) {
      throw new Error(`Unsupported master data group: ${activeKey}`);
    } else {
      throw new Error(`Unsupported master data group: ${activeKey}`);
    }
  }

  async function toggleActive(key: MasterKey, row: MasterRow) {
    if (mutationPending || statusMutationInFlight.current) return false;
    statusMutationInFlight.current = true;
    try {
      if (apiEnabled && key === "departments") {
        const apiRow = row as ApiMasterRow;
        await updateDepartment.mutateAsync({
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(apiRow.active ? "Department deactivated" : "Department activated");
        return true;
      }
      if (apiEnabled && key === "designations") {
        const apiRow = row as ApiMasterRow;
        await updateDesignation.mutateAsync({
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(apiRow.active ? "Designation deactivated" : "Designation activated");
        return true;
      }
      if (apiEnabled && isExtendedApiMasterKey(key)) {
        const apiRow = row as ApiMasterRow;
        await updateExtendedMaster.mutateAsync({
          masterKey: key,
          id: apiRow.id,
          input: {
            status: apiRow.active ? "inactive" : "active",
            expected_version: apiRow.version,
          },
        });
        toast.success(
          apiRow.active
            ? `${MASTER_LABELS[key].replace(/s$/, "")} deactivated`
            : `${MASTER_LABELS[key].replace(/s$/, "")} activated`,
        );
        return;
      }
      toggleMasterActive(key, row.id);
      return true;
    } catch (error) {
      toastApiError(error, "Master data update failed");
      if (apiEnabled && CORE_MASTER_KEYS.includes(key as CoreApiMasterKey)) {
        await refetchFor(key as CoreApiMasterKey);
      }
      return false;
    } finally {
      statusMutationInFlight.current = false;
    }
  }

  async function deactivateRow(key: MasterKey, row: MasterRow): Promise<boolean> {
    if (apiEnabled && CORE_MASTER_KEYS.includes(key as CoreApiMasterKey)) {
      if (!row.active) return true;
      return Boolean(await toggleActive(key, row));
    }
    deleteMaster(key, row.id);
    toast.success("Deleted");
    return true;
  }

  return (
    <Tabs value={activeKey} onValueChange={(v) => setActiveKey(v as MasterKey)}>
      <TabsList className="h-auto w-full justify-start">
        {visibleKeys.map((k) => (
          <TabsTrigger key={k} value={k}>
            {MASTER_LABELS[k]}
          </TabsTrigger>
        ))}
      </TabsList>

      {visibleKeys.map((k) => (
        <TabsContent key={k} value={k} className="mt-4">
          <Card className="rounded-2xl border-border/60 p-0">
            <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{MASTER_LABELS[k]}</p>
                <p className="text-xs text-muted-foreground">
                  {apiEnabled
                    ? `${activePage?.total ?? 0} record${activePage?.total === 1 ? "" : "s"}`
                    : `${rowsFor(k).length} record${rowsFor(k).length === 1 ? "" : "s"}`}
                </p>
                {errorFor(k) && (
                  <p className="mt-1 text-xs text-destructive">{errorFor(k)?.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {apiEnabled && (
                  <SearchFilterBar
                    value={serverSearch}
                    onValueChange={(value) => {
                      void navigate({
                        to: "/admin-settings/master-data",
                        search: {
                          tab: activeKey,
                          page: undefined,
                          q: value || undefined,
                        },
                        replace: true,
                      });
                    }}
                    placeholder="Search name or code"
                    searchLabel={`Search ${MASTER_LABELS[k].toLowerCase()}`}
                    showExport={false}
                  />
                )}
                <ActionButton
                  size="sm"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={startAdd}
                  disabled={!canMutate(k) || mutationPending}
                >
                  Add
                </ActionButton>
              </div>
            </div>
            <DataTable
              columns={columns(k)}
              rows={rowsFor(k)}
              searchKeys={["name", "id", "meta", "description"]}
              loading={loadingFor(k)}
              hideToolbar={apiEnabled}
              rowActions={(row) => [
                { label: "Edit", onClick: () => startEdit(row), disabled: mutationPending },
                {
                  label: row.active ? "Deactivate" : "Activate",
                  onClick: canMutate(k) ? () => void toggleActive(k, row) : undefined,
                  disabled: mutationPending,
                },
                ...(!apiEnabled && canMutate(k)
                  ? [
                      {
                        label: "Delete",
                        tone: "destructive" as const,
                        onClick: () => void deactivateRow(k, row),
                      },
                    ]
                  : []),
              ]}
              rowActionLabel={(row) => `Actions for ${row.name}`}
              emptyTitle={`No ${MASTER_LABELS[k].toLowerCase()} yet`}
              emptyDescription={undefined}
            />
            {apiEnabled && (
              <div className="flex flex-col gap-2 border-t p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loadingFor(k)}
                    onClick={() =>
                      void navigate({
                        to: "/admin-settings/master-data",
                        search: {
                          tab: activeKey,
                          page: page - 1 > 1 ? page - 1 : undefined,
                          q: serverSearch || undefined,
                        },
                      })
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages || loadingFor(k)}
                    onClick={() =>
                      void navigate({
                        to: "/admin-settings/master-data",
                        search: {
                          tab: activeKey,
                          page: page + 1,
                          q: serverSearch || undefined,
                        },
                      })
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      ))}

      <Modal
        open={open}
        onOpenChange={(next) => {
          if (mutationPending || submissionInFlight.current) return;
          setOpen(next);
          setLatestConflict(null);
        }}
        title={
          editing
            ? `Edit ${MASTER_LABELS[activeKey].replace(/s$/, "")}`
            : `Add ${MASTER_LABELS[activeKey].replace(/s$/, "")}`
        }
        description={`Manage ${MASTER_LABELS[activeKey].toLowerCase()} for the active company. Changes are validated before they are saved.`}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (!submissionInFlight.current) setOpen(false);
              }}
              disabled={mutationPending}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              style={{ background: "var(--gradient-primary)" }}
              className="text-primary-foreground"
              disabled={mutationPending || Boolean(latestConflict)}
            >
              {mutationPending ? "Saving..." : editing ? "Save changes" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="master-name">
              Name
            </Label>
            <Input
              id="master-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Engineering"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="master-description">
              {apiEnabled && (activeKey === "departments" || activeKey === "designations")
                ? "Code (optional)"
                : "Description (optional)"}
            </Label>
            <Input
              id="master-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={
                apiEnabled && (activeKey === "departments" || activeKey === "designations")
                  ? "Optional code, e.g. ENG"
                  : "Short description"
              }
            />
          </div>
          {apiEnabled && activeKey === "departments" && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="department-parent">
                Parent department
              </Label>
              <Input
                aria-label="Search parent departments"
                value={parentSearch}
                onChange={(event) => setParentSearch(event.target.value)}
                placeholder="Find an active parent by name or code"
              />
              <Select
                value={form.parentDepartmentId || "__none__"}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    parentDepartmentId: value === "__none__" ? "" : value,
                  })
                }
              >
                <SelectTrigger id="department-parent">
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Top level (no parent)</SelectItem>
                  {form.parentDepartmentId &&
                    !parentOptions.some((option) => option.id === form.parentDepartmentId) && (
                      <SelectItem value={form.parentDepartmentId} disabled>
                        {(editing as ApiMasterRow | null)?.parentName ?? "Unavailable parent"}{" "}
                        (unavailable)
                      </SelectItem>
                    )}
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Search returns up to 25 active same-company matches. The server rejects self,
                descendant, inactive and foreign parents.
              </p>
              {parentDepartmentsQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Loading parent matches...</p>
              )}
              {parentDepartmentsQuery.error instanceof Error && (
                <p className="text-xs text-destructive">{parentDepartmentsQuery.error.message}</p>
              )}
            </div>
          )}
          {apiEnabled && activeKey === "designations" && (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="designation-level">
                Level (optional)
              </Label>
              <Input
                id="designation-level"
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.designationLevel}
                onChange={(event) => setForm({ ...form, designationLevel: event.target.value })}
                placeholder="e.g. 3"
              />
            </div>
          )}
          {latestConflict && (
            <div role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-3">
              <p className="text-sm font-medium">A newer version is available</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your draft is preserved. Retry only after reviewing it against the refreshed list.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setEditing(latestConflict);
                  setLatestConflict(null);
                }}
              >
                Retry against latest version
              </Button>
            </div>
          )}
          {editing && canMutate(activeKey) && (
            <button
              disabled={mutationPending}
              onClick={async () => {
                if (await deactivateRow(activeKey, editing)) setOpen(false);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />{" "}
              {apiEnabled ? "Deactivate this record" : "Delete this record"}
            </button>
          )}
        </div>
      </Modal>
    </Tabs>
  );
}

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
