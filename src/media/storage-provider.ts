export interface StorageProvider {
  save(filename: string, buffer: Buffer): Promise<string>;
}
