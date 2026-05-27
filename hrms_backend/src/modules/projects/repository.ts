import { randomUUID } from "node:crypto";
import type {
  ProjectAllocationRecord,
  ProjectMemberRecord,
  ProjectMilestoneRecord,
  ProjectRecord,
  UUID
} from "#shared";
import { ProjectMemberStatuses } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { nowIso } from "../../platform/data-store.js";
import { conflict, notFound } from "../../platform/errors.js";

export interface ProjectListFilters {
  status?: string;
  client?: string;
  managerUserId?: UUID;
  search?: string;
}

export class ProjectsRepository {
  constructor(private readonly store: MemoryDataStore) {}

  nextProjectCode(name: string): string {
    const prefix = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 12) || "PROJECT";
    let code = prefix;
    let suffix = 1;
    while (this.store.projects.some((project) => project.project_code === code)) {
      suffix += 1;
      code = `${prefix}-${suffix}`;
    }
    return code;
  }

  addProject(input: Omit<ProjectRecord, "id" | "created_at" | "updated_at" | "version" | "deleted_at">): ProjectRecord {
    const duplicate = this.store.projects.find(
      (project) => !project.deleted_at && project.project_code.toLowerCase() === input.project_code.toLowerCase()
    );
    if (duplicate) {
      throw conflict("Project code already exists.", { project_code: input.project_code, project_id: duplicate.id });
    }
    const now = nowIso();
    const project: ProjectRecord = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.projects.push(project);
    return project;
  }

  findProject(id: UUID): ProjectRecord {
    const project = this.store.projects.find((candidate) => candidate.id === id && !candidate.deleted_at);
    if (!project) {
      throw notFound("Project not found", { id });
    }
    return project;
  }

  listProjects(filters: ProjectListFilters = {}): ProjectRecord[] {
    const search = filters.search?.trim().toLowerCase();
    return this.store.projects
      .filter((project) => {
        if (project.deleted_at) return false;
        if (filters.status && project.status !== filters.status) return false;
        if (filters.client && project.client_name !== filters.client) return false;
        if (filters.managerUserId && project.manager_user_id !== filters.managerUserId) return false;
        if (search) {
          const haystack = [project.project_code, project.name, project.client_name, project.description ?? ""].join(" ").toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => a.project_code.localeCompare(b.project_code));
  }

  updateProjectVersioned(id: UUID, expectedVersion: number, mutator: (project: ProjectRecord) => void): ProjectRecord {
    const project = this.findProject(id);
    if (project.version !== expectedVersion) {
      throw conflict("Project was modified by another actor.", { aggregate: "project", id });
    }
    mutator(project);
    const duplicate = this.store.projects.find(
      (candidate) =>
        candidate.id !== id &&
        !candidate.deleted_at &&
        candidate.project_code.toLowerCase() === project.project_code.toLowerCase()
    );
    if (duplicate && duplicate.project_code.toLowerCase() === project.project_code.toLowerCase()) {
      throw conflict("Project code already exists.", { project_code: project.project_code, project_id: duplicate.id });
    }
    project.version += 1;
    project.updated_at = nowIso();
    return project;
  }

  listMembers(projectId: UUID, activeOnly = false): ProjectMemberRecord[] {
    return this.store.projectMembers
      .filter((member) => {
        if (member.project_id !== projectId || member.deleted_at) return false;
        if (activeOnly && member.status !== ProjectMemberStatuses.Active) return false;
        return true;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  findMember(projectId: UUID, memberId: UUID): ProjectMemberRecord {
    const member = this.store.projectMembers.find((candidate) => candidate.project_id === projectId && candidate.id === memberId && !candidate.deleted_at);
    if (!member) {
      throw notFound("Project member not found", { project_id: projectId, member_id: memberId });
    }
    return member;
  }

  addMember(input: Omit<ProjectMemberRecord, "id" | "created_at" | "updated_at" | "version" | "deleted_at">): ProjectMemberRecord {
    const duplicate = this.store.projectMembers.find(
      (member) =>
        member.project_id === input.project_id &&
        member.employee_user_id === input.employee_user_id &&
        member.status === ProjectMemberStatuses.Active &&
        !member.deleted_at
    );
    if (duplicate) {
      throw conflict("Employee is already an active member of this project.", { member_id: duplicate.id });
    }
    const now = nowIso();
    const member: ProjectMemberRecord = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.projectMembers.push(member);
    return member;
  }

  updateMemberVersioned(projectId: UUID, memberId: UUID, expectedVersion: number, mutator: (member: ProjectMemberRecord) => void): ProjectMemberRecord {
    const member = this.findMember(projectId, memberId);
    if (member.version !== expectedVersion) {
      throw conflict("Project member was modified by another actor.", { aggregate: "project_member", member_id: memberId });
    }
    mutator(member);
    member.version += 1;
    member.updated_at = nowIso();
    return member;
  }

  listAllocations(projectId: UUID, userId?: UUID): ProjectAllocationRecord[] {
    return this.store.projectAllocations
      .filter((allocation) => !allocation.deleted_at && allocation.project_id === projectId && (!userId || allocation.employee_user_id === userId))
      .sort((a, b) => b.date_from.localeCompare(a.date_from));
  }

  addAllocation(input: Omit<ProjectAllocationRecord, "id" | "created_at" | "updated_at" | "version" | "deleted_at">): ProjectAllocationRecord {
    const now = nowIso();
    const allocation: ProjectAllocationRecord = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.projectAllocations.push(allocation);
    return allocation;
  }

  listMilestones(projectId: UUID, status?: string): ProjectMilestoneRecord[] {
    return this.store.projectMilestones
      .filter((milestone) => !milestone.deleted_at && milestone.project_id === projectId && (!status || milestone.status === status))
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }

  addMilestone(input: Omit<ProjectMilestoneRecord, "id" | "created_at" | "updated_at" | "version" | "deleted_at">): ProjectMilestoneRecord {
    const now = nowIso();
    const milestone: ProjectMilestoneRecord = {
      id: randomUUID(),
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      ...input
    };
    this.store.projectMilestones.push(milestone);
    return milestone;
  }
}
