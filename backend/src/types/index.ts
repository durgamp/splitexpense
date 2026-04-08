// ─── Database row types (snake_case mirrors SQL Server columns) ───────────────
// MSSQL returns BIGINT columns as JavaScript BigInt; wrap with Number() in builders.

type DbNum = number | bigint;

export interface UserRow {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  created_at: DbNum;
  last_active_at: DbNum;
}

export interface OtpRow {
  id: string;
  email: string;
  code_hash: string;
  expires_at: DbNum;
  attempts: number;
  created_at: DbNum;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: DbNum;
  created_at: DbNum;
}

export interface GroupRow {
  id: string;
  name: string;
  type: 'group' | 'direct';
  created_by: string;
  invite_token: string;
  invite_token_created_at: DbNum;
  created_at: DbNum;
}

export interface GroupMemberRow {
  group_id: string;
  phone: string;
  user_id: string | null;
  name: string;
  status: 'active' | 'pending' | 'removed';
  role: 'admin' | 'member';
  invited_by: string;
  joined_at: DbNum | null;
}

export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount_paise: DbNum;
  paid_by_phone: string;
  category: string;
  split_type: string;
  notes: string | null;
  created_by: string;
  created_at: DbNum;
  updated_at: DbNum;
  deleted_at: DbNum | null;
}

export interface PaymentRow {
  id: string;
  group_id: string;
  from_phone: string;
  to_phone: string;
  amount_paise: DbNum;
  notes: string | null;
  created_by: string;
  created_at: DbNum;
}

export interface ExpenseShareRow {
  expense_id: string;
  phone: string;
  amount_paise: DbNum;
}

// ─── API response types (camelCase for JSON) ──────────────────────────────────

export interface User {
  id: string;
  email: string;
  phone: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface GroupMember {
  phone: string;
  userId: string | null;
  name: string;
  status: 'active' | 'pending' | 'removed';
  role: 'admin' | 'member';
  invitedBy: string;
  joinedAt: number | null;
}

export interface Group {
  id: string;
  name: string;
  type: 'group' | 'direct';
  createdBy: string;
  createdAt: number;
  members: GroupMember[];
  inviteToken: string;
  inviteTokenCreatedAt: number;
}

export interface ExpenseShare {
  phone: string;
  amountPaise: number;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountPaise: number;
  paidByPhone: string;
  shares: ExpenseShare[];
  category: string;
  splitType: string;
  notes: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Payment {
  id: string;
  groupId: string;
  fromPhone: string;
  toPhone: string;
  amountPaise: number;
  notes: string | null;
  createdBy: string;
  createdAt: number;
}

export interface NetBalance {
  phone: string;
  name: string;
  netPaise: number;
}

export interface Settlement {
  fromPhone: string;
  fromName: string;
  toPhone: string;
  toName: string;
  amountPaise: number;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      userPhone?: string;
    }
  }
}
