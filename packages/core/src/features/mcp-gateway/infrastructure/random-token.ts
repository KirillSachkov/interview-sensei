import { randomBytes } from "node:crypto";

/** 256 random bits in base64url: an MCP address token that nobody can guess. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}
