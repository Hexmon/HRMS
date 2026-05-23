import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryKeys, queryTimings } from "@/shared/query";
import { helpdeskApi, type HelpdeskQuery } from "./api";

export function useHelpdeskTickets(query: HelpdeskQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("helpdesk", "tickets", query),
    queryFn: () => helpdeskApi.list(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useHelpdeskCategories(query: HelpdeskQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("helpdesk", "categories", query),
    queryFn: () => helpdeskApi.categories(query),
    enabled,
    staleTime: queryTimings.referenceStaleMs,
    placeholderData: keepPreviousData,
  });
}

export function useHelpdeskSlaReport(query: HelpdeskQuery = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.list("helpdesk", "sla-report", query),
    queryFn: () => helpdeskApi.slaReport(query),
    enabled,
    staleTime: queryTimings.listStaleMs,
    placeholderData: keepPreviousData,
  });
}
