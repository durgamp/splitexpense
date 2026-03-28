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

export type ExpenseCategory =
  | 'food' | 'transport' | 'accommodation'
  | 'entertainment' | 'utilities' | 'shopping' | 'other';

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountPaise: number;
  paidByPhone: string;
  shares: ExpenseShare[];
  category: ExpenseCategory;
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
