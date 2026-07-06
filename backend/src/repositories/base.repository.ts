import { getDb, schema } from '../db';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

function snakeToCamel(str: string) {
  return str.replace(/([-_][a-z])/ig, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''));
}

function camelToSnake(str: string) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function convertKeysToCamel(obj: any) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj: any = {};
  for (const key in obj) {
    newObj[snakeToCamel(key)] = obj[key];
  }
  return newObj;
}

function convertKeysToSnake(obj: any) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj: any = {};
  for (const key in obj) {
    newObj[camelToSnake(key)] = obj[key];
  }
  return newObj;
}

export abstract class BaseRepository<T extends { id?: string }> {
  constructor(protected tableName: string) {}

  protected getMariaDb() {
    const db = getDb();
    if (db && !db._mock) return db;
    return null;
  }
  
  protected getTableSchema() {
    const camelTableName = snakeToCamel(this.tableName);
    if ((schema as any)[camelTableName]) return (schema as any)[camelTableName];
    if ((schema as any)[this.tableName]) return (schema as any)[this.tableName];
    throw new Error(`Table ${this.tableName} not found in schema`);
  }

  private getFilePath() {
    return path.join(process.cwd(), 'data', `${this.tableName}.json`);
  }

  private async readLocalData(): Promise<any[]> {
    const file = this.getFilePath();
    if (!fs.existsSync(file)) return [];
    try {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  private async writeLocalData(data: any[]) {
    const file = this.getFilePath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  public async findById(id: string): Promise<T | null> {
    const data = await this.readLocalData();
    return data.find((r: any) => String(r.id) === String(id)) || null;
  }

  public async findOne(predicate: (item: T) => boolean): Promise<T | null> {
    const data = await this.readLocalData();
    return data.find(predicate) || null;
  }

  public async findMany(predicate: (item: T) => boolean): Promise<T[]> {
    const data = await this.readLocalData();
    return data.filter(predicate);
  }

  public async query(): Promise<T[]> {
    return this.readLocalData();
  }

  public async insert(item: any): Promise<T> {
    // 1. Write to JSON
    const data = await this.readLocalData();
    const newItem = {
      id: item.id || uuidv4(),
      ...convertKeysToSnake(item)
    };
    data.push(newItem);
    await this.writeLocalData(data);

    // 2. Write to MariaDB
    const mariadb = this.getMariaDb();
    let dbResult: any = null;
    let mariaError = '';
    if (mariadb) {
      try {
        const table = this.getTableSchema();
        const camelItem = convertKeysToCamel(newItem);
        
        // Remove fields not in schema before inserting to avoid crash
        // Drizzle ignores fields not in schema? No, it might throw type error, but since we cast it to `any` it might throw at runtime.
        // It's safer to only include fields present in the schema.
        const safeCamelItem: any = {};
        for (const key in camelItem) {
          if (table[key]) {
            safeCamelItem[key] = camelItem[key];
          }
        }

        await mariadb.insert(table).values(safeCamelItem);
        
        const rows = await mariadb.select().from(table).where(eq(table.id, newItem.id));
        if (rows.length) {
          dbResult = convertKeysToSnake(rows[0]);
        }
      } catch (err: any) {
        mariaError = err.message;
      }
    }

    // 3. Compare and log
    this.compareSync(newItem.id, newItem, dbResult, mariaError);

    return newItem as T;
  }

  public async update(id: string, updates: any): Promise<T | null> {
    // 1. Write to JSON
    const data = await this.readLocalData();
    const index = data.findIndex((r: any) => String(r.id) === String(id));
    if (index === -1) return null;
    data[index] = { ...data[index], ...convertKeysToSnake(updates) };
    const jsonResult = data[index];
    await this.writeLocalData(data);

    // 2. Write to MariaDB
    const mariadb = this.getMariaDb();
    let dbResult: any = null;
    let mariaError = '';
    if (mariadb) {
      try {
        const table = this.getTableSchema();
        const camelUpdates = convertKeysToCamel(updates);
        
        const safeCamelUpdates: any = {};
        for (const key in camelUpdates) {
          if (table[key]) {
            safeCamelUpdates[key] = camelUpdates[key];
          }
        }

        await mariadb.update(table).set(safeCamelUpdates).where(eq(table.id, id));
        const rows = await mariadb.select().from(table).where(eq(table.id, id));
        if (rows.length) {
          dbResult = convertKeysToSnake(rows[0]);
        }
      } catch (err: any) {
        mariaError = err.message;
      }
    }

    // 3. Compare and log
    this.compareSync(id, jsonResult, dbResult, mariaError);

    return jsonResult as T;
  }

  public async delete(id: string): Promise<boolean> {
    let data = await this.readLocalData();
    const exists = data.some((r: any) => String(r.id) === String(id));
    data = data.filter((r: any) => String(r.id) !== String(id));
    await this.writeLocalData(data);

    const mariadb = this.getMariaDb();
    let dbResult = false;
    let mariaError = '';
    if (mariadb) {
      try {
        const table = this.getTableSchema();
        await mariadb.delete(table).where(eq(table.id, id));
        dbResult = true; // Assume success if no error thrown
      } catch (err: any) {
        mariaError = err.message;
      }
    }

    if (exists !== dbResult) {
       logger.error(`[SYNC ERROR]\nTable: ${this.tableName}\nPrimary Key: ${id}\nField: delete_status\nJSON Value: ${exists}\nMariaDB Value: ${dbResult}\nError: ${mariaError}`);
    } else {
       logger.info(`[SYNC OK] ${this.tableName}`);
    }

    return true;
  }

  private compareSync(id: string, jsonRecord: any, dbRecord: any, mariaError: string) {
    if (!dbRecord) {
      logger.error(`[SYNC ERROR]\nTable: ${this.tableName}\nPrimary Key: ${id}\nField: ALL\nJSON Value: ${JSON.stringify(jsonRecord)}\nMariaDB Value: null\nError: ${mariaError}`);
      return;
    }
    
    let mismatch = false;
    for (const key in jsonRecord) {
      let jsonVal = jsonRecord[key];
      let dbVal = dbRecord[key];
      
      if (jsonVal instanceof Date) jsonVal = jsonVal.toISOString();
      if (dbVal instanceof Date) dbVal = dbVal.toISOString();
      
      // JSON stores dates as strings, MariaDB might return Date objects or strings.
      if (jsonVal && typeof jsonVal === 'string' && dbVal && dbVal instanceof Date) {
         dbVal = dbVal.toISOString();
      }

      // We use weak equality or string equality to avoid false positives on type differences
      if (String(jsonVal) !== String(dbVal) && jsonVal !== dbVal && !(jsonVal == null && dbVal == null)) {
        logger.error(`[SYNC ERROR]\nTable: ${this.tableName}\nPrimary Key: ${id}\nField: ${key}\nJSON Value: ${jsonVal}\nMariaDB Value: ${dbVal}`);
        mismatch = true;
      }
    }

    if (!mismatch) {
      logger.info(`[SYNC OK] ${this.tableName}`);
    }
  }
}
