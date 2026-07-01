// TronNest Client TypeScript Types

export interface Token {
  id: number;
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
  id: number;
  wallet_id: number;
  type: 'blockchain' | 'internal';
  direction: 'in' | 'out' | 'self';
  asset_symbol: string;
  amount: number;
  counterparty: string;
  fee: number;
  status: 'pending' | 'completed' | 'failed';
  tx_hash: string | null;
  internal_ledger_id: number | null;
  blockchain_tx_id: number | null;
  created_at: string;
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface UserProfile {
  id: number;
  address: string;
  status: 'active' | 'frozen' | 'suspended';
  createdAt: string;
  balances: {
    symbol: string;
    balance: number;
  }[];
}

export interface AuditLog {
  id: number;
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
