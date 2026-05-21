import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import type { ExpectedVersionBody, PageQuery } from "@/shared/api";
import { expensesApi } from "./api";

export function useMyExpenses(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("expenses", "mine", query),
    queryFn: () => expensesApi.listMine(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useExpenseDetail(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.detail("expenses", "ticket", id ?? "missing"),
    queryFn: () => expensesApi.get(id as string),
    enabled: enabled && Boolean(id),
    staleTime: queryTimings.detailStaleMs,
  });
}

export function useManagerExpenseQueue(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("expenses", "manager-queue", query),
    queryFn: () => expensesApi.managerQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useFinanceExpenseQueue(query: PageQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("expenses", "finance-queue", query),
    queryFn: () => expensesApi.financeQueue(query),
    enabled,
    staleTime: queryTimings.realtimeStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useExpenseWorkflowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      input,
    }: {
      id: string;
      action: "submit" | "managerVerify" | "financeApprove" | "payment" | "settle";
      input: ExpectedVersionBody;
    }) => {
      if (action === "submit") return expensesApi.submit(id, input);
      if (action === "managerVerify") return expensesApi.managerVerify(id, input);
      if (action === "financeApprove") return expensesApi.financeApprove(id, input);
      if (action === "payment") return expensesApi.recordPayment(id, input);
      return expensesApi.settle(id, input);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.domain("expenses") });
      queryClient.invalidateQueries({
        queryKey: queryKeys.detail("expenses", "ticket", variables.id),
      });
    },
  });
}
