import type { FastifyInstance } from "fastify";
import type { AuthUser } from "#shared";

export async function loginAs(app: FastifyInstance, employeeCode: string): Promise<{ token: string; user: AuthUser }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { employee_code: employeeCode }
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${employeeCode}: ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as { access_token: string; user: AuthUser };
  return { token: body.access_token, user: body.user };
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export const projectTravelPayload = {
  submit: true,
  expense_type: "Project",
  expense_sub_type: "Project Travel",
  project_code: "PRJ-100",
  task_title: "Client implementation travel",
  task_description: "Travel for implementation workshop",
  location: "Mumbai",
  start_date: "2026-05-01",
  end_date: "2026-05-03",
  estimated_amount: "1000.00",
  payment_type: "Advance",
  advance_amount: "500.00",
  line_items: [
    {
      line_category: "travel",
      description: "Flight",
      line_total: "700.00"
    },
    {
      line_category: "lodging",
      description: "Hotel",
      line_total: "300.00"
    }
  ]
};
