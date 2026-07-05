// TronNest Client TypeScript Types

export interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string;
  isInternal: boolean;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  isTransferEnabled: boolean;
}

export interface Transaction {
  id: string;
  wallet_id: string;
  type: 'blockchain' | 'internal';
  direction: 'in' | 'out' | 'self';
  asset_symbol: string;
  amount: number;
  counterparty: string;
  fee: number;
  status: 'pending' | 'completed' | 'failed';
  tx_hash: string | null;
  internal_ledger_id: string | null;
  blockchain_tx_id: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  address: string;
  status: 'active' | 'frozen' | 'suspended';
  createdAt: string;
  balances: {
    symbol: string;
    balance: number;
  }[];
}

export interface AuditLog {
  id: string;
  username?: string;
  action: string;
  ipAddress: string;
  createdAt: string;
}

export interface SystemStats {
  totalUsers: number;
  totalWallets: number;
  totalTokens: number;
  totalTransactions: number;
  blockchainTxCount: number;
  internalTxCount: number;
  latestTransactions: Transaction[];
  logsCount: number;
}
