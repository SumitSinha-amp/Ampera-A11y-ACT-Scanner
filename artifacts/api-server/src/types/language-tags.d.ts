declare module "language-tags" {
  /** Returns a registered IANA language subtag, or null when absent. */
  export function language(subtag: string): { format(): string } | null;
}
