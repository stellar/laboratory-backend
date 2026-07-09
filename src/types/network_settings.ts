// ADD NETWORK SETTINGS TYPE
export interface NetworkLimits {
  // Per-transaction limits
  tx_max_instructions: number;
  tx_memory_limit: number;
  tx_max_footprint_entries: number;
  tx_max_disk_read_entries: number;
  tx_max_write_ledger_entries: number;
  tx_max_disk_read_bytes: number;
  tx_max_write_bytes: number;
  tx_max_contract_events_size_bytes: number;
  contract_data_key_size_bytes: number;
  contract_max_size_bytes: number;

  // Ledger-wide limits
  ledger_max_instructions: number;
  ledger_max_disk_read_entries: number;
  ledger_max_disk_read_bytes: number;
  ledger_max_write_ledger_entries: number;
  ledger_max_write_bytes: number;
  ledger_max_txs_size_bytes: number;
  ledger_max_dependent_tx_clusters: number;

  // State archival TTL extension parameters
  max_entry_ttl: number;
  min_temporary_ttl: number;
  min_persistent_ttl: number;

  // Resource fees (in stroops)
  fee_rate_per_instructions_increment: number;
  fee_read_ledger_entry: string;
  fee_write_ledger_entry: string;
  fee_read_1kb: string;
  fee_write_1kb: string;
  fee_tx_size_1kb: string;
  fee_historical_1kb: string;
  fee_contract_events_1kb: string;
  persistent_rent_rate_denominator: string;
  temp_rent_rate_denominator: string;
  live_soroban_state_size_window: string[];

  // Rent-related config parameters for computing fee_per_rent_1kb
  state_target_size_bytes: string;
  rent_fee_1kb_state_size_low: string;
  rent_fee_1kb_state_size_high: string;
  state_size_rent_fee_growth_factor: number;
}
