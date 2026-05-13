import { createJwt, verifyPasswordSync } from "#auth";
import type { AuthUser } from "#shared";
import { forbidden, unauthorized } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import { AuthRepository } from "./repository.js";
import type { LoginInput } from "./schemas.js";

export class AuthService {
  private readonly repository: AuthRepository;

  constructor(
    private readonly store: MemoryDataStore,
    private readonly jwtSecret: string
  ) {
    this.repository = new AuthRepository(store);
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; token: string; expires_at: string; jti: string }> {
    const user = input.email && input.password
      ? this.authenticatePassword(input.email, input.password)
      : this.authenticateEmployeeCode(input.employee_code ?? "");
    const jwt = createJwt(user, this.jwtSecret, 3600);
    await this.store.sessionStore.create({
      jti: jwt.jti,
      user_id: user.id,
      expires_at: jwt.expiresAt,
      revoked_at: null
    });
    return { user, token: jwt.token, expires_at: jwt.expiresAt, jti: jwt.jti };
  }

  private authenticateEmployeeCode(employeeCode: string): AuthUser {
    const user = this.repository.findUserByEmployeeCode(employeeCode);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  private authenticatePassword(email: string, password: string): AuthUser {
    const user = this.repository.findUserByEmail(email);
    if (!user) {
      throw unauthorized("Invalid email or password");
    }
    if (user.employment_status !== "active") {
      throw forbidden("User account is inactive or blocked");
    }
    const passwordHash = this.repository.findActivePasswordHash(user.id);
    if (!passwordHash || !verifyPasswordSync(password, passwordHash)) {
      throw unauthorized("Invalid email or password");
    }
    return user;
  }

  async logout(jti: string): Promise<void> {
    await this.store.sessionStore.revoke(jti, "logout");
  }
}
