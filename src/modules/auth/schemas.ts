import { z } from "zod";

export const loginSchema = z
  .object({
    email: z.email().optional(),
    password: z.string().min(1).optional(),
    employee_code: z.string().min(1).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const hasPasswordCredentials = Boolean(value.email || value.password);
    const hasEmployeeCode = Boolean(value.employee_code);
    if (!hasPasswordCredentials && !hasEmployeeCode) {
      context.addIssue({ code: "custom", path: ["email"], message: "Email is required." });
      context.addIssue({ code: "custom", path: ["password"], message: "Password is required." });
      return;
    }
    if (hasPasswordCredentials) {
      if (!value.email) {
        context.addIssue({ code: "custom", path: ["email"], message: "Email is required." });
      }
      if (!value.password) {
        context.addIssue({ code: "custom", path: ["password"], message: "Password is required." });
      }
    }
  });

export type LoginInput = z.infer<typeof loginSchema>;
