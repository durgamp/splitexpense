import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const newId = (): string => uuidv4();

/** Generate a cryptographically random hex token. */
export const randomHex = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('hex');
