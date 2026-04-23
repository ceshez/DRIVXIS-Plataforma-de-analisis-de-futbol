import bcrypt from "bcryptjs";

const COST_FACTOR = 12;

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST_FACTOR);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
