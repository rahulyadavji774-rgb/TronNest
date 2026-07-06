import { logger } from '../utils/logger';
import { eq, and } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { v4 as uuidv4 } from 'uuid';

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

function buildWhereClause(table: any, conditions: any) {
  const parts: any[] = [];
  for (const [key, value] of Object.entries(conditions)) {
    const colName = snakeToCamel(key);
    if (table[colName]) {
      parts.push(eq(table[colName], value));
    }
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
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

  public async transaction<T = any>(callback: (tx: any) => Promise<T>): Promise<T> {
    const db = getDb();
    return await db.transaction(callback);
  }

  public async query<T = any>(tableName: string, tx?: any): Promise<T[]> {
    const db = tx || getDb();
    const table = getTable(tableName);
    const rows = await db.select().from(table);
    return rows.map(convertKeysToSnake) as T[];
  }

  public async findById<T extends { id: string } = any>(tableName: string, id: string, tx?: any): Promise<T | null> {
    const db = tx || getDb();
    const table = getTable(tableName);
    const rows = await db.select().from(table).where(eq(table.id, id)).limit(1);
    if (!rows.length) return null;
    return convertKeysToSnake(rows[0]) as T;
  }

  public async findOne<T = any>(tableName: string, conditions: any, tx?: any): Promise<T | null> {
    const db = tx || getDb();
    const table = getTable(tableName);
    
    if (typeof conditions === 'function') {
      const rows = await this.query<T>(tableName, db);
      return rows.find(conditions) || null;
    }

    const where = buildWhereClause(table, conditions);
    const query = db.select().from(table);
    const rows = where ? await query.where(where).limit(1) : await query.limit(1);
    
    if (!rows.length) return null;
    return convertKeysToSnake(rows[0]) as T;
  }

  public async findMany<T = any>(tableName: string, conditions: any, tx?: any): Promise<T[]> {
    const db = tx || getDb();
    const table = getTable(tableName);
    
    if (typeof conditions === 'function') {
      const rows = await this.query<T>(tableName, db);
      return rows.filter(conditions);
    }

    const where = buildWhereClause(table, conditions);
    const query = db.select().from(table);
    const rows = where ? await query.where(where) : await query;
    return rows.map(convertKeysToSnake) as T[];
  }

  public async insert<T extends { id?: string } = any>(tableName: string, item: T, tx?: any): Promise<T> {
    const db = tx || getDb();
    const newItem: any = {
      id: uuidv4(),
      ...convertKeysToCamel(item)
    };
    
    const table = getTable(tableName);
    
    // Strict schema validation: Ensure all provided keys exist in the Drizzle table schema
    
    
    try {

      console.log("INSERT DEBUG:", tableName, JSON.stringify(newItem));
      await db.insert(table).values(newItem);
    } catch (error: any) {
      logger.error(`Failed query in insert: ${tableName}`);
      logger.error(`error message: ${error.message}`);
      logger.error(`error cause: ${error.cause}`);
      logger.error(`error stack: ${error.stack}`);
      logger.error(`parameters: ${JSON.stringify(newItem)}`);
      throw error;
    }
    return convertKeysToSnake(newItem) as T;
  }

  public async update<T extends { id: string } = any>(tableName: string, id: string, updates: any, tx?: any): Promise<T | null> {
    const db = tx || getDb();
    
    const table = getTable(tableName);
    
    // Strict schema validation: Ensure all provided keys exist in the Drizzle table schema
    
    
    try {

      await db.update(table).set(convertKeysToCamel(updates)).where(eq(table.id, id));
    } catch (error: any) {
      logger.error(`Failed query in update: ${tableName}`);
      logger.error(`error message: ${error.message}`);
      logger.error(`error cause: ${error.cause}`);
      logger.error(`error stack: ${error.stack}`);
      logger.error(`parameters: ${JSON.stringify(updates)}`);
      throw error;
    }
    return this.findById<T>(tableName, id, db);
  }

  public async delete(tableName: string, id: string, tx?: any): Promise<boolean> {
    const db = tx || getDb();
    const table = getTable(tableName);
    await db.delete(table).where(eq(table.id, id));
    return true;
  }
}
