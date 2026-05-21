import { useMutation } from "@tanstack/react-query";
import { reportsApi } from "./api";

export function useCreateReportExportMutation() {
  return useMutation({
    mutationFn: reportsApi.createExport,
  });
}
