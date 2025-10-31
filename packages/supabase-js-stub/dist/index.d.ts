export interface SupabaseStubResult<T = any> {
  data: T | null;
  error: Error | null;
}

export interface SupabaseStubTable<T = any> {
  select(): Promise<SupabaseStubResult<T[]>>;
  insert(values: Partial<T> | Partial<T>[]): Promise<SupabaseStubResult<T[]>>;
  upsert(values: Partial<T> | Partial<T>[]): Promise<SupabaseStubResult<T[]>>;
  update(values: Partial<T>): Promise<SupabaseStubResult<T[]>>;
  delete(): Promise<SupabaseStubResult<T[]>>;
  eq(column: string, value: any): SupabaseStubTable<T>;
  match(query: Record<string, any>): SupabaseStubTable<T>;
  single(): Promise<SupabaseStubResult<T>>;
}

export interface SupabaseStubClient {
  url: string;
  key: string;
  options: Record<string, any>;
  from<T = any>(table: string): SupabaseStubTable<T>;
  storage: {
    from(bucket: string): {
      upload(path: string, body: any, options?: Record<string, any>): Promise<SupabaseStubResult>;
      list(path?: string, options?: Record<string, any>): Promise<SupabaseStubResult<any[]>>;
      remove(paths: string[]): Promise<SupabaseStubResult>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
  auth: {
    getSession(): Promise<SupabaseStubResult<{ session: any }>>;
    signInWithPassword(credentials: Record<string, any>): Promise<SupabaseStubResult>;
    signOut(): Promise<SupabaseStubResult>;
  };
  functions: {
    invoke<T = any>(path: string, args?: Record<string, any>): Promise<SupabaseStubResult<T>>;
  };
  rpc<T = any>(fn: string, args?: Record<string, any>): SupabaseStubTable<T>;
}

export declare function createClient(url?: string, key?: string, options?: Record<string, any>): SupabaseStubClient;
declare const _default: {
  createClient: typeof createClient;
};
export default _default;
