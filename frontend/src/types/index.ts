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

export type ExpenseCategory =
  | 'food' | 'transport' | 'accommodation'
  | 'entertainment' | 'utilities' | 'shopping' | 'other';

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

export interface CustomSplit {
  phone: string;
  value: number;
}

export interface Expense {
  id: string;
  groupId: string;
  description: string;
  amountPaise: number;
  paidByPhone: string;
  shares: ExpenseShare[];
  category: ExpenseCategory;
  splitType: SplitType;
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
