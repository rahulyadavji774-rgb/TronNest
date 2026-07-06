import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
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

function getTable(tableName: string) {
  const camelTableName = snakeToCamel(tableName);
  if ((schema as any)[camelTableName]) return (schema as any)[camelTableName];
  if ((schema as any)[tableName]) return (schema as any)[tableName];
  throw new Error(`Table ${tableName} not found in schema`);
}

export class JsonDatabase {
  private static instance: JsonDatabase;

  private constructor() {}

  public static getInstance(): JsonDatabase {
    if (!JsonDatabase.instance) {
      JsonDatabase.instance = new JsonDatabase();
    }
    return JsonDatabase.instance;
  }

  private getFilePath(tableName: string) {
    return path.join(process.cwd(), 'data', `${tableName}.json`);
  }

  private async readLocalData(tableName: string) {
    const file = this.getFilePath(tableName);
    if (!fs.existsSync(file)) return [];
    try {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  private async writeLocalData(tableName: string, data: any[]) {
    const file = this.getFilePath(tableName);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  public async query<T>(tableName: string): Promise<T[]> {
    return (await this.readLocalData(tableName)) as T[];
  }

  public async findById<T extends { id: string }>(tableName: string, id: string): Promise<T | null> {
    const rows = await this.query<T>(tableName);
    return rows.find((r: any) => String(r.id) === String(id)) || null;
  }

  public async findOne<T>(tableName: string, predicate: (item: T) => boolean): Promise<T | null> {
    const rows = await this.query<T>(tableName);
    return rows.find(predicate) || null;
  }

  public async findMany<T>(tableName: string, predicate: (item: T) => boolean): Promise<T[]> {
    const rows = await this.query<T>(tableName);
    return rows.filter(predicate);
  }

  public async insert<T extends { id?: string }>(tableName: string, item: T): Promise<T> {
    // 1. Write to JSON (source of truth)
    const data = await this.readLocalData(tableName);
    const id = item.id || uuidv4();
    const snakeItem = {
      id,
      ...convertKeysToSnake(item)
    };
    data.push(snakeItem);
    await this.writeLocalData(tableName, data);

    // 2. Write to MariaDB (dual write)
    const db = getDb();
    if (db && !db._mock) {
      try {
        const table = getTable(tableName);
        const camelItem = convertKeysToCamel(snakeItem);
        
        const safeCamelItem: any = {};
        for (const key in camelItem) {
          if (table[key]) {
            safeCamelItem[key] = camelItem[key];
          }
        }
        await db.insert(table).values(safeCamelItem);
      } catch (err: any) {
        console.error(`[MariaDB Dual-Write Insert Error] Table: ${tableName}, Error: ${err.message}`);
      }
    }

    return snakeItem as T;
  }

  public async update<T extends { id: string }>(tableName: string, id: string, updates: any): Promise<T | null> {
    // 1. Write to JSON (source of truth)
    const data = await this.readLocalData(tableName);
    const index = data.findIndex((r: any) => String(r.id) === String(id));
    if (index === -1) return null;
    data[index] = { ...data[index], ...convertKeysToSnake(updates) };
    await this.writeLocalData(tableName, data);
    const updatedItem = data[index];

    // 2. Write to MariaDB (dual write)
    const db = getDb();
    if (db && !db._mock) {
      try {
        const table = getTable(tableName);
        const camelUpdates = convertKeysToCamel(updates);
        
        const safeCamelUpdates: any = {};
        for (const key in camelUpdates) {
          if (table[key]) {
            safeCamelUpdates[key] = camelUpdates[key];
          }
        }
        await db.update(table).set(safeCamelUpdates).where(eq(table.id, id));
      } catch (err: any) {
        console.error(`[MariaDB Dual-Write Update Error] Table: ${tableName}, ID: ${id}, Error: ${err.message}`);
      }
    }

    return updatedItem as T;
  }

  public async delete(tableName: string, id: string): Promise<boolean> {
    // 1. Write to JSON (source of truth)
    let data = await this.readLocalData(tableName);
    data = data.filter((r: any) => String(r.id) !== String(id));
    await this.writeLocalData(tableName, data);

    // 2. Write to MariaDB (dual write)
    const db = getDb();
    if (db && !db._mock) {
      try {
        const table = getTable(tableName);
        await db.delete(table).where(eq(table.id, id));
      } catch (err: any) {
        console.error(`[MariaDB Dual-Write Delete Error] Table: ${tableName}, ID: ${id}, Error: ${err.message}`);
      }
    }

    return true;
  }
}
