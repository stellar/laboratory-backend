import { rpc, xdr } from "@stellar/stellar-sdk";
import { Request, Response } from "express";

const LEDGER_ENTRY_KEY_XDRS = [
  "AAAACAAAAAA=", // contract_max_size_bytes
  "AAAACAAAAAE=", // contract_compute_v0
  "AAAACAAAAAI=", // contract_ledger_cost_v0
  "AAAACAAAAAM=", // contract_historical_data_v0
  "AAAACAAAAAQ=", // contract_events_v0
  "AAAACAAAAAU=", // contract_bandwidth_v0
  "AAAACAAAAAY=", // contract_cost_params_cpu_instructions
  "AAAACAAAAAc=", // contract_cost_params_memory_bytes
  "AAAACAAAAAg=", // contract_data_key_size_bytes
  "AAAACAAAAAk=", // contract_data_entry_size_bytes
  "AAAACAAAAAo=", // state_archival
  "AAAACAAAAAs=", // contract_execution_lanes
  "AAAACAAAAA4=", // contract_parallel_compute_v0
  "AAAACAAAAA8=", // contract_ledger_cost_ext_v0
  "AAAACAAAABA=", // scp_timing
  "AAAACAAAAAw=", // live_soroban_state_size_window
];

// Parse the base64 XDR strings into real LedgerKey objects
const LEDGER_ENTRY_KEYS: xdr.LedgerKey[] = LEDGER_ENTRY_KEY_XDRS.map(k =>
  xdr.LedgerKey.fromXDR(k, "base64"),
);

// Extract the network limits from the parsed ledger entries using the SDK's
// typed XDR accessors. Each entry's `val` is a ConfigSettingEntry union keyed
// by its ConfigSettingID; index them by that id so we can pull each setting.
const parseNetworkLimits = (response: rpc.Api.GetLedgerEntriesResponse) => {
  const settings = new Map<string, xdr.ConfigSettingEntry>();
  for (const { val } of response.entries) {
    const cs = val.configSetting();
    settings.set(cs.switch().name, cs);
  }

  const compute = settings
    .get("configSettingContractComputeV0")
    ?.contractCompute();
  const ledgerCost = settings
    .get("configSettingContractLedgerCostV0")
    ?.contractLedgerCost();
  const ledgerCostExt = settings
    .get("configSettingContractLedgerCostExtV0")
    ?.contractLedgerCostExt();
  const events = settings
    .get("configSettingContractEventsV0")
    ?.contractEvents();
  const bandwidth = settings
    .get("configSettingContractBandwidthV0")
    ?.contractBandwidth();
  const historicalData = settings
    .get("configSettingContractHistoricalDataV0")
    ?.contractHistoricalData();
  const parallelCompute = settings
    .get("configSettingContractParallelComputeV0")
    ?.contractParallelCompute();
  const stateArchival = settings
    .get("configSettingStateArchival")
    ?.stateArchivalSettings();
  const maxSizeBytes = settings
    .get("configSettingContractMaxSizeBytes")
    ?.contractMaxSizeBytes();
  const dataKeySizeBytes = settings
    .get("configSettingContractDataKeySizeBytes")
    ?.contractDataKeySizeBytes();
  const liveStateSizeWindow = settings
    .get("configSettingLiveSorobanStateSizeWindow")
    ?.liveSorobanStateSizeWindow();

  return {
    // Per-transaction limits
    tx_max_instructions: Number(compute?.txMaxInstructions()),
    tx_memory_limit: compute?.txMemoryLimit(),
    tx_max_footprint_entries: ledgerCostExt?.txMaxFootprintEntries(),
    tx_max_disk_read_entries: ledgerCost?.txMaxDiskReadEntries(),
    tx_max_write_ledger_entries: ledgerCost?.txMaxWriteLedgerEntries(),
    tx_max_disk_read_bytes: ledgerCost?.txMaxDiskReadBytes(),
    tx_max_write_bytes: ledgerCost?.txMaxWriteBytes(),
    tx_max_contract_events_size_bytes: events?.txMaxContractEventsSizeBytes(),
    contract_data_key_size_bytes: dataKeySizeBytes,
    contract_max_size_bytes: maxSizeBytes,

    // Ledger-wide limits
    ledger_max_instructions: Number(compute?.ledgerMaxInstructions()),
    ledger_max_disk_read_entries: ledgerCost?.ledgerMaxDiskReadEntries(),
    ledger_max_disk_read_bytes: ledgerCost?.ledgerMaxDiskReadBytes(),
    ledger_max_write_ledger_entries: ledgerCost?.ledgerMaxWriteLedgerEntries(),
    ledger_max_write_bytes: ledgerCost?.ledgerMaxWriteBytes(),
    ledger_max_txs_size_bytes: bandwidth?.ledgerMaxTxsSizeBytes(),
    ledger_max_dependent_tx_clusters:
      parallelCompute?.ledgerMaxDependentTxClusters(),

    // State archival TTL extension parameters
    max_entry_ttl: stateArchival?.maxEntryTtl(),
    min_temporary_ttl: stateArchival?.minTemporaryTtl(),
    min_persistent_ttl: stateArchival?.minPersistentTtl(),

    // Resource fees (in stroops). 64-bit values are returned as strings to
    // avoid precision loss beyond Number.MAX_SAFE_INTEGER.
    fee_rate_per_instructions_increment: Number(
      compute?.feeRatePerInstructionsIncrement(),
    ),
    fee_disk_read_ledger_entry: ledgerCost?.feeDiskReadLedgerEntry().toString(),
    fee_write_ledger_entry: ledgerCost?.feeWriteLedgerEntry().toString(),
    fee_disk_read_1kb: ledgerCost?.feeDiskRead1Kb().toString(),
    fee_write_1kb: ledgerCostExt?.feeWrite1Kb().toString(),
    fee_tx_size_1kb: bandwidth?.feeTxSize1Kb().toString(),
    fee_historical_1kb: historicalData?.feeHistorical1Kb().toString(),
    fee_contract_events_1kb: events?.feeContractEvents1Kb().toString(),
    persistent_rent_rate_denominator: stateArchival
      ?.persistentRentRateDenominator()
      .toString(),
    temp_rent_rate_denominator: stateArchival
      ?.tempRentRateDenominator()
      .toString(),

    // Rent-related config parameters for computing fee_per_rent_1kb
    live_soroban_state_size_window: liveStateSizeWindow?.map(v => v.toString()),
    state_target_size_bytes: ledgerCost
      ?.sorobanStateTargetSizeBytes()
      .toString(),
    rent_fee_1kb_state_size_low: ledgerCost
      ?.rentFee1KbSorobanStateSizeLow()
      .toString(),
    rent_fee_1kb_state_size_high: ledgerCost
      ?.rentFee1KbSorobanStateSizeHigh()
      .toString(),
    state_size_rent_fee_growth_factor:
      ledgerCost?.sorobanStateRentFeeGrowthFactor(),
  };
};

export const getNetworkLimits = async (
  req: Request,
  res: Response,
): Promise<void | Response> => {
  const query = res.locals?.parsedQuery ?? req.query;
  const { rpc_url } = query;

  const fetchLedgerEntries = async (rpcUrl: string) => {
    const server = new rpc.Server(rpcUrl);
    return server.getLedgerEntries(...LEDGER_ENTRY_KEYS);
  };

  try {
    const response = await fetchLedgerEntries(rpc_url);
    return res.status(200).json(parseNetworkLimits(response));
  } catch (error) {
    return res.status(502).json({
      error: "Failed to fetch ledger entries",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
