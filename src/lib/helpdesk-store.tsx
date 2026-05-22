import * as React from "react";
import {
  TICKETS as SEED_TICKETS,
  CATEGORIES as SEED_CATEGORIES,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type TicketComment,
  type TicketEvent,
  type TicketAttachment,
  type CategoryConfig,
} from "./mock/helpdesk";

const T_KEY = "hawkaii_tickets_v1";
const C_KEY = "hawkaii_helpdesk_categories_v1";

const ls = {
  get<T>(k: string, fb: T): T {
    if (typeof window === "undefined") return fb;
    try {
      const r = window.localStorage.getItem(k);
      return r ? (JSON.parse(r) as T) : fb;
    } catch {
      return fb;
    }
  },
  set(k: string, v: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(k, JSON.stringify(v));
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const evt = (actor: string, action: string, detail?: string): TicketEvent => ({
  id: "e_" + uid(),
  at: now(),
  actor,
  action,
  detail,
});

export interface NewTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  subCategory: string;
  priority: TicketPriority;
  raisedBy: string;
  raisedByEmail?: string;
  raisedByDept?: string;
  relatedAssetId?: string;
  relatedProjectId?: string;
  attachmentName?: string;
}

interface Ctx {
  tickets: Ticket[];
  categories: CategoryConfig[];
  createTicket: (input: NewTicketInput) => Ticket;
  addComment: (
    id: string,
    body: string,
    author: string,
    authorRole?: string,
    internal?: boolean,
  ) => void;
  addAttachment: (id: string, name: string, by: string) => void;
  changePriority: (id: string, priority: TicketPriority, actor: string) => void;
  assign: (id: string, assignee: string, assigneeRole: string | undefined, actor: string) => void;
  setStatus: (id: string, status: TicketStatus, actor: string, note?: string) => void;
  resolve: (id: string, resolution: string, actor: string) => void;
  close: (id: string, actor: string) => void;
  reopen: (id: string, reason: string, actor: string) => void;
  escalate: (id: string, reason: string, actor: string) => void;
  upsertCategory: (c: CategoryConfig) => void;
  toggleCategory: (key: string, active: boolean) => void;
  reset: () => void;
}

const Ctx_ = React.createContext<Ctx | null>(null);

export function HelpdeskProvider({ children }: { children: React.ReactNode }) {
  const [tickets, setTickets] = React.useState<Ticket[]>(SEED_TICKETS);
  const [categories, setCategories] = React.useState<CategoryConfig[]>(SEED_CATEGORIES);

  React.useEffect(() => {
    setTickets(ls.get(T_KEY, SEED_TICKETS));
    setCategories(ls.get(C_KEY, SEED_CATEGORIES));
  }, []);

  const persistT = (next: Ticket[]) => {
    setTickets(next);
    ls.set(T_KEY, next);
  };
  const persistC = (next: CategoryConfig[]) => {
    setCategories(next);
    ls.set(C_KEY, next);
  };

  const update = (id: string, mut: (t: Ticket) => Ticket) => {
    persistT(tickets.map((t) => (t.id === id ? { ...mut(t), updatedAt: now() } : t)));
  };

  const createTicket: Ctx["createTicket"] = (input) => {
    const cfg = categories.find((c) => c.key === input.category);
    const max = tickets.reduce((m, t) => {
      const n = parseInt(t.id.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 12000);
    const id = `TKT-${max + 1}`;
    const at = now();
    const attachments: TicketAttachment[] = input.attachmentName
      ? [{ id: "f_" + uid(), name: input.attachmentName, size: "—", by: input.raisedBy, at }]
      : [];
    const t: Ticket = {
      id,
      subject: input.subject,
      description: input.description,
      category: input.category,
      subCategory: input.subCategory,
      priority: input.priority,
      status: cfg?.defaultAssignee ? "assigned" : "new",
      raisedBy: input.raisedBy,
      raisedByEmail: input.raisedByEmail,
      raisedByDept: input.raisedByDept,
      assignee: cfg?.defaultAssignee,
      assigneeRole: cfg?.defaultAssigneeRole,
      createdAt: at,
      updatedAt: at,
      relatedAssetId: input.relatedAssetId,
      relatedProjectId: input.relatedProjectId,
      reopenCount: 0,
      escalated: false,
      comments: [],
      attachments,
      events: [
        { id: "e_" + uid(), at, actor: input.raisedBy, action: "Ticket created" },
        ...(cfg?.defaultAssignee
          ? [
              {
                id: "e_" + uid(),
                at,
                actor: "System",
                action: `Auto-assigned to ${cfg.defaultAssignee}`,
              },
            ]
          : []),
      ],
    };
    persistT([t, ...tickets]);
    return t;
  };

  const addComment: Ctx["addComment"] = (id, body, author, authorRole, internal) => {
    update(id, (t) => {
      const isFirstResponse = !t.firstResponseAt && author !== t.raisedBy;
      const c: TicketComment = { id: "c_" + uid(), at: now(), author, authorRole, body, internal };
      return {
        ...t,
        comments: [...t.comments, c],
        firstResponseAt: isFirstResponse ? now() : t.firstResponseAt,
        events: [...t.events, evt(author, internal ? "Internal note added" : "Comment added")],
      };
    });
  };

  const addAttachment: Ctx["addAttachment"] = (id, name, by) => {
    update(id, (t) => ({
      ...t,
      attachments: [...t.attachments, { id: "f_" + uid(), name, size: "—", by, at: now() }],
      events: [...t.events, evt(by, "Attachment uploaded", name)],
    }));
  };

  const changePriority: Ctx["changePriority"] = (id, priority, actor) => {
    update(id, (t) => ({
      ...t,
      priority,
      events: [...t.events, evt(actor, "Priority changed", `→ ${priority}`)],
    }));
  };

  const assign: Ctx["assign"] = (id, assignee, assigneeRole, actor) => {
    update(id, (t) => ({
      ...t,
      assignee,
      assigneeRole,
      status: t.status === "new" ? "assigned" : t.status,
      events: [...t.events, evt(actor, "Assigned", `→ ${assignee}`)],
    }));
  };

  const setStatus: Ctx["setStatus"] = (id, status, actor, note) => {
    update(id, (t) => ({
      ...t,
      status,
      events: [...t.events, evt(actor, `Status → ${status.replace("_", " ")}`, note)],
    }));
  };

  const resolve: Ctx["resolve"] = (id, resolution, actor) => {
    update(id, (t) => ({
      ...t,
      status: "resolved",
      resolvedAt: now(),
      resolution,
      events: [...t.events, evt(actor, "Resolved", resolution)],
    }));
  };

  const close: Ctx["close"] = (id, actor) => {
    update(id, (t) => ({
      ...t,
      status: "closed",
      closedAt: now(),
      events: [...t.events, evt(actor, "Closed")],
    }));
  };

  const reopen: Ctx["reopen"] = (id, reason, actor) => {
    update(id, (t) => ({
      ...t,
      status: "reopened",
      resolvedAt: undefined,
      closedAt: undefined,
      reopenCount: t.reopenCount + 1,
      events: [...t.events, evt(actor, "Reopened", reason)],
    }));
  };

  const escalate: Ctx["escalate"] = (id, reason, actor) => {
    update(id, (t) => ({
      ...t,
      escalated: true,
      status: "escalated",
      priority: t.priority === "Low" ? "Medium" : t.priority === "Medium" ? "High" : "Urgent",
      events: [...t.events, evt(actor, "Escalated", reason)],
    }));
  };

  const upsertCategory: Ctx["upsertCategory"] = (c) => {
    const idx = categories.findIndex((x) => x.key === c.key);
    if (idx === -1) persistC([...categories, c]);
    else persistC(categories.map((x) => (x.key === c.key ? c : x)));
  };

  const toggleCategory: Ctx["toggleCategory"] = (key, active) => {
    persistC(categories.map((c) => (c.key === key ? { ...c, active } : c)));
  };

  const reset = () => {
    persistT(SEED_TICKETS);
    persistC(SEED_CATEGORIES);
  };

  return (
    <Ctx_.Provider
      value={{
        tickets,
        categories,
        createTicket,
        addComment,
        addAttachment,
        changePriority,
        assign,
        setStatus,
        resolve,
        close,
        reopen,
        escalate,
        upsertCategory,
        toggleCategory,
        reset,
      }}
    >
      {children}
    </Ctx_.Provider>
  );
}

export function useHelpdesk() {
  const c = React.useContext(Ctx_);
  if (!c) throw new Error("useHelpdesk must be used inside HelpdeskProvider");
  return c;
}

// ---- role helpers ----
export const HELPDESK_AGENT_ROLES = [
  "main_admin",
  "helpdesk_agent",
  "asset_admin",
  "hr_admin",
  "finance_manager",
] as const;

export function categoryForRole(role: string | null): TicketCategory[] {
  switch (role) {
    case "asset_admin":
      return ["IT", "Assets"];
    case "hr_admin":
      return ["HR"];
    case "finance_manager":
      return ["Finance"];
    case "helpdesk_agent":
      return ["IT", "Admin", "Project Support"];
    case "main_admin":
      return ["IT", "HR", "Finance", "Admin", "Assets", "Project Support"];
    default:
      return [];
  }
}

export const PRIORITY_TONE: Record<TicketPriority, { cls: string; dot: string }> = {
  Urgent: {
    cls: "bg-destructive/15 text-destructive border-destructive/30",
    dot: "bg-destructive",
  },
  High: { cls: "bg-warning/20 text-warning-foreground border-warning/40", dot: "bg-warning" },
  Medium: { cls: "bg-info/15 text-info border-info/30", dot: "bg-info" },
  Low: { cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground/60" },
};

export type { Ticket, TicketCategory, TicketPriority, TicketStatus, CategoryConfig };
