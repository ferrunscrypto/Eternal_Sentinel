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
}, []>;

export type BoolResult = CallResult<{ success: boolean }, []>;
export type TriggerTierResult = CallResult<{ releasedAmount: bigint }, []>;
export type HasVaultResult = CallResult<{ exists: boolean }, []>;
export type GetBeneficiaryResult = CallResult<{ beneficiary: string }, []>;
export type GetFeeAmountResult = CallResult<{ fee: bigint }, []>;

export interface IEternalSentinelContract extends BaseContractProperties {
    _createVault(beneficiary: string): Promise<BoolResult>;
    _checkIn(): Promise<BoolResult>;
    _setBeneficiary(newBeneficiary: string): Promise<BoolResult>;
    _deposit(amount: bigint): Promise<BoolResult>;
    _triggerTier1(owner: string): Promise<TriggerTierResult>;
    _triggerTier2(owner: string): Promise<TriggerTierResult>;
    _getStatus(owner: string): Promise<GetStatusResult>;
    _getBeneficiary(owner: string): Promise<GetBeneficiaryResult>;
    _hasVault(owner: string): Promise<HasVaultResult>;
    _getFeeAmount(): Promise<GetFeeAmountResult>;
}
