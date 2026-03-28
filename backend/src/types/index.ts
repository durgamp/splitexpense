// ─── Database row types (snake_case mirrors SQLite columns) ──────────────────

export interface UserRow {
  id: string;
  phone: string;
  name: string;
  created_at: number;
  last_active_at: number;
}

export interface OtpRow {
  id: string;
  phone: string;
  code_hash: string;
  expires_at: number;
  attempts: number;
  created_at: number;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
}

export interface GroupRow {
  id: string;
  name: string;
  created_by: string;
  invite_token: string;
  invite_token_created_at: number;
  created_at: number;
}

export interface GroupMemberRow {
  group_id: string;
  phone: string;
  user_id: string | null;
  name: string;
  status: 'active' | 'pending' | 'removed';
  role: 'admin' | 'member';
  invited_by: string;
  joined_at: number | null;
}

export interface ExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount_paise: number;
  paid_by_phone: string;
  category: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ExpenseShareRow {
  expense_id: string;
  phone: string;
  amount_paise: number;
}

// ─── API response types (camelCase for JSON) ─────────────────────────────────

export interface User {
  id: string;
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
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
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
      userPhone?: string;
    }
  }
}
