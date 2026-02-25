import { CallResult, BaseContractProperties } from 'opnet';

export type GetStatusResult = CallResult<{
    currentStatus: bigint;
    lastHeartbeatBlock: bigint;
    currentBlock: bigint;
    totalDeposited: bigint;
    tier1Amount: bigint;
    tier2Amount: bigint;
    tier1BlocksRemaining: bigint;
    tier2BlocksRemaining: bigint;
    owner: bigint;
}, []>;

export type CreateVaultResult = CallResult<{ vaultId: bigint }, []>;
export type BoolResult = CallResult<{ success: boolean }, []>;
export type TriggerTierResult = CallResult<{ releasedAmount: bigint }, []>;
export type HasVaultResult = CallResult<{ exists: boolean }, []>;
export type GetBeneficiaryResult = CallResult<{ beneficiary: bigint }, []>;
export type GetFeeAmountResult = CallResult<{ fee: bigint }, []>;
export type GetVaultCountResult = CallResult<{ count: bigint }, []>;
export type GetVaultIdByIndexResult = CallResult<{ vaultId: bigint }, []>;

export interface IEternalSentinelContract extends BaseContractProperties {
    _createVault(beneficiary: string): Promise<CreateVaultResult>;
    _checkIn(vaultId: bigint): Promise<BoolResult>;
    _setBeneficiary(vaultId: bigint, newBeneficiary: string): Promise<BoolResult>;
    _deposit(vaultId: bigint, amount: bigint): Promise<BoolResult>;
    _triggerTier1(vaultId: bigint): Promise<TriggerTierResult>;
    _triggerTier2(vaultId: bigint): Promise<TriggerTierResult>;
    _getStatus(vaultId: bigint): Promise<GetStatusResult>;
    _getBeneficiary(vaultId: bigint): Promise<GetBeneficiaryResult>;
    _hasVault(vaultId: bigint): Promise<HasVaultResult>;
    _getVaultCount(owner: string): Promise<GetVaultCountResult>;
    _getVaultIdByIndex(owner: string, index: bigint): Promise<GetVaultIdByIndexResult>;
    _getFeeAmount(): Promise<GetFeeAmountResult>;
}
