import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/** Generate a 6-digit OTP. Returns '123456' in dev mode for easy testing. */
export function generateOtp(): string {
  if (process.env.OTP_DEV_EXPOSE === 'true' && process.env.NODE_ENV !== 'production') {
    return '123456';
  }
  // Use rejection sampling to avoid modulo bias
  let value: number;
  do {
    const buf = crypto.randomBytes(4);
    value = buf.readUInt32BE(0);
  } while (value >= 4_000_000_000);

  return String(value % 1_000_000).padStart(6, '0');
}

/** Hash an OTP code for safe storage. */
export async function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, BCRYPT_ROUNDS);
}

/** Verify a plain OTP code against its stored hash. */
export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
