export interface Source {
  /** Writes new data into the normalized tables. `changed` is true when any row was inserted or updated. */
  pull(): Promise<{ changed: boolean }>;
}
