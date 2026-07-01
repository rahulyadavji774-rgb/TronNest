import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export class JsonDatabase {
  private static instance: JsonDatabase;
  private cache: Record<string, any[]> = {};

  private constructor() {
    this.initDefaultTables();
  }

  public static getInstance(): JsonDatabase {
    if (!JsonDatabase.instance) {
      JsonDatabase.instance = new JsonDatabase();
    }
    return JsonDatabase.instance;
  }

  private getTablePath(tableName: string): string {
    return path.join(DATA_DIR, `${tableName}.json`);
  }

  private loadTable<T>(tableName: string): T[] {
    if (this.cache[tableName]) {
      return this.cache[tableName] as T[];
    }
    const filePath = this.getTablePath(tableName);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
      this.cache[tableName] = [];
      return [];
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      this.cache[tableName] = data;
      return data as T[];
    } catch (e) {
      console.error(`Error loading table ${tableName}, resetting table:`, e);
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
      this.cache[tableName] = [];
      return [];
    }
  }

  private saveTable<T>(tableName: string, data: T[]): void {
    this.cache[tableName] = data;
    const filePath = this.getTablePath(tableName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  private initDefaultTables() {
    // Initialise default table lists
    const tables = [
      'users',
      'wallets',
      'wallet_security',
      'tokens',
      'token_prices',
      'balances',
      'internal_ledger',
      'blockchain_transactions',
      'transaction_history',
      'sessions',
      'notifications',
      'admins',
      'admin_logs',
      'wallet_logs',
      'devices',
      'audit_logs',
      'app_settings',
      'network_settings',
    ];

    for (const table of tables) {
      this.loadTable(table);
    }

    // Seed default tokens if empty
    const tokens = this.loadTable<any>('tokens');
    if (tokens.length === 0) {
      const defaultTokens = [
        {
          id: 1,
          name: 'TRON',
          symbol: 'TRX',
          decimals: 6,
          logo_url: 'https://cryptologos.cc/logos/tron-trx-logo.png',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: false,
          contract_address: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 2,
          name: 'Tether USD',
          symbol: 'USDT',
          decimals: 6,
          logo_url: 'https://cryptologos.cc/logos/tether-usdt-logo.png',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: false,
          contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 3,
          name: 'Nest Dollar',
          symbol: 'mUSD',
          decimals: 6,
          logo_url: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: true,
          contract_address: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 4,
          name: 'Gold Nest',
          symbol: 'GOLD',
          decimals: 2,
          logo_url: 'https://images.unsplash.com/photo-1610375228911-2f073259b662?q=80&w=200&auto=format&fit=crop',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: true,
          contract_address: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      this.saveTable('tokens', defaultTokens);
    }

    // Seed token prices if empty
    const prices = this.loadTable<any>('token_prices');
    if (prices.length === 0) {
      const defaultPrices = [
        { id: 1, token_id: 1, price_usd: 0.125, updated_at: new Date().toISOString() },
        { id: 2, token_id: 2, price_usd: 1.00, updated_at: new Date().toISOString() },
        { id: 3, token_id: 3, price_usd: 1.00, updated_at: new Date().toISOString() },
        { id: 4, token_id: 4, price_usd: 75.50, updated_at: new Date().toISOString() },
      ];
      this.saveTable('token_prices', defaultPrices);
    }

    // Seed default admin if empty
    const admins = this.loadTable<any>('admins');
    if (admins.length === 0) {
      // password_hash is bcrypt hash for "Admin@TronNest123"
      admins.push({
        id: 1,
        username: 'admin_root',
        password_hash: '$2b$12$fTz4K2o0eCOi7ncoQhV8D.hRz1A5pC56zQ7rJ1X5/V11S9jZlFz36',
        role: 'root',
        created_at: new Date().toISOString(),
      });
      this.saveTable('admins', admins);
    }

    // Seed default AppSettings
    const appSettings = this.loadTable<any>('app_settings');
    if (appSettings.length === 0) {
      const defaults = [
        { id: 1, setting_key: 'min_withdrawal_fee_trx', setting_value: '2.0', updated_at: new Date().toISOString() },
        { id: 2, setting_key: 'support_email', setting_value: 'support@tronnest.com', updated_at: new Date().toISOString() },
        { id: 3, setting_key: 'allow_internal_transfers', setting_value: 'true', updated_at: new Date().toISOString() },
      ];
      this.saveTable('app_settings', defaults);
    }

    // Seed default NetworkSettings
    const networkSettings = this.loadTable<any>('network_settings');
    if (networkSettings.length === 0) {
      const defaults = [
        {
          id: 1,
          network_name: 'mainnet',
          full_node_url: 'https://api.trongrid.io',
          solidity_node_url: 'https://api.trongrid.io',
          event_server_url: 'https://api.trongrid.io',
          usdt_contract_address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          updated_at: new Date().toISOString(),
        },
      ];
      this.saveTable('network_settings', defaults);
    }
  }

  // Relational Operations
  public query<T>(tableName: string): T[] {
    return this.loadTable<T>(tableName);
  }

  public findById<T extends { id: number }>(tableName: string, id: number): T | null {
    const list = this.loadTable<T>(tableName);
    return list.find((item) => item.id === id) || null;
  }

  public findOne<T>(tableName: string, predicate: (item: T) => boolean): T | null {
    const list = this.loadTable<T>(tableName);
    return list.find(predicate) || null;
  }

  public findMany<T>(tableName: string, predicate: (item: T) => boolean): T[] {
    const list = this.loadTable<T>(tableName);
    return list.filter(predicate);
  }

  public insert<T extends { id?: number }>(tableName: string, item: T): T {
    const list = this.loadTable<T>(tableName);
    const nextId = list.reduce((max, item: any) => (item.id > max ? item.id : max), 0) + 1;
    const newItem = {
      ...item,
      id: nextId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    list.push(newItem);
    this.saveTable(tableName, list);
    return newItem;
  }

  public update<T extends { id: number }>(tableName: string, id: number, updates: any): T | null {
    const list = this.loadTable<T>(tableName);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updatedItem = {
      ...list[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    list[index] = updatedItem;
    this.saveTable(tableName, list);
    return updatedItem;
  }

  public delete(tableName: string, id: number): boolean {
    const list = this.loadTable<any>(tableName);
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    this.saveTable(tableName, list);
    return true;
  }
}
