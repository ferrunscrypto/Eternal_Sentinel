import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    StoredU256,
    StoredAddress,
    SafeMath,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '@btc-vision/btc-runtime/runtime/storage/maps/StoredMapU256';
import { AddressMemoryMap } from '@btc-vision/btc-runtime/runtime/memory/AddressMemoryMap';
import { MapOfMap } from '@btc-vision/btc-runtime/runtime/memory/MapOfMap';

// ── Block-time constants ────────────────────────────────────────────────────
// ~26,280 blocks ≈ 6 months at 1 block/10 min
const TIER_1_BLOCKS: u64 = 26_280;
// ~52,560 blocks ≈ 12 months
const TIER_2_BLOCKS: u64 = 52_560;

// ── Tier split (basis points, 10 000 = 100%) ───────────────────────────────
const TIER_1_BPS: u256 = u256.fromU32(1_000); // 10%
const BPS_DENOMINATOR: u256 = u256.fromU32(10_000);

// ── Status codes ───────────────────────────────────────────────────────────
const STATUS_UNINITIALIZED: u256 = u256.Zero;     // 0  — no vault
const STATUS_ACTIVE: u256 = u256.fromU32(1);       // 1  — alive
const STATUS_TIER1_RELEASED: u256 = u256.fromU32(2); // 2  — 6-month release done
const STATUS_FINALIZED: u256 = u256.fromU32(3);    // 3  — fully released

// ── Default creation fee (10 000 sats = 0.0001 BTC) ───────────────────────
const DEFAULT_FEE: u256 = u256.fromU64(10_000);

/**
 * EternalSentinel — Multi-Vault Dead-Man's Switch with Progressive Inheritance.
 *
 * Any address can create multiple isolated vaults, each identified by an
 * auto-incrementing vaultId (u256). Ownership is derived from
 * Blockchain.tx.sender — no address spoofing possible.
 *
 * Architecture
 * ────────────
 *  • Each vault is identified by a unique vaultId (global auto-increment).
 *  • StoredMapU256 instances store per-vault state keyed by vaultId.
 *  • MapOfMap + AddressMemoryMap track owner -> vault index mapping.
 *  • A global feeAmount (StoredU256) and feeRecipient (StoredAddress) track platform fees.
 *
 * Inheritance Timeline
 * ─────────────────────
 *  Tier 1 — 10% released after TIER_1_BLOCKS (~6 months) with no check-in.
 *  Tier 2 — remaining 90% released after TIER_2_BLOCKS (~12 months) with no check-in.
 *  The clock resets on every check-in (owner signs in = still alive).
 */
export class EternalSentinel extends OP_NET {

    // ── Pointers (each Blockchain.nextPointer call allocates a unique slot) ───
    private readonly _nextVaultIdPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultOwnerPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultBeneficiaryPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultStatusPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultHeartbeatPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultDepositedPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultTier1AmtPointer: u16 = Blockchain.nextPointer;
    private readonly _vaultTier2AmtPointer: u16 = Blockchain.nextPointer;
    private readonly _ownerVaultsPointer: u16 = Blockchain.nextPointer;
    private readonly _ownerVaultCountPointer: u16 = Blockchain.nextPointer;
    private readonly _feeAmountPointer: u16 = Blockchain.nextPointer;
    private readonly _feeRecipientPointer: u16 = Blockchain.nextPointer;
    private readonly _totalVaultsPointer: u16 = Blockchain.nextPointer;

    // ── Per-vault maps (key = vaultId as u256) ──────────────────────────────────
    /** Vault owner address stored as u256 */
    private readonly vaultOwner: StoredMapU256 = new StoredMapU256(this._vaultOwnerPointer);
    /** Vault beneficiary address stored as u256 */
    private readonly vaultBeneficiary: StoredMapU256 = new StoredMapU256(this._vaultBeneficiaryPointer);
    /** Vault lifecycle status: 0=none, 1=active, 2=tier1_released, 3=finalized */
    private readonly vaultStatus: StoredMapU256 = new StoredMapU256(this._vaultStatusPointer);
    /** Block number of last check-in (or vault creation), stored as u256 */
    private readonly vaultHeartbeat: StoredMapU256 = new StoredMapU256(this._vaultHeartbeatPointer);
    /** Cumulative BTC deposited (satoshis) */
    private readonly vaultDeposited: StoredMapU256 = new StoredMapU256(this._vaultDepositedPointer);
    /** 10% tier-1 entitlement */
    private readonly vaultTier1Amt: StoredMapU256 = new StoredMapU256(this._vaultTier1AmtPointer);
    /** 90% tier-2 entitlement */
    private readonly vaultTier2Amt: StoredMapU256 = new StoredMapU256(this._vaultTier2AmtPointer);

    // ── Owner -> vault index mapping ────────────────────────────────────────────
    /** owner -> (index_bytes -> vaultId) */
    private readonly ownerVaults: MapOfMap<u256> = new MapOfMap<u256>(this._ownerVaultsPointer);
    /** owner -> vault count */
    private readonly ownerVaultCount: AddressMemoryMap = new AddressMemoryMap(this._ownerVaultCountPointer);

    // ── Global platform state ─────────────────────────────────────────────────
    private readonly nextVaultId: StoredU256 = new StoredU256(this._nextVaultIdPointer, EMPTY_POINTER);
    private readonly feeAmount: StoredU256 = new StoredU256(this._feeAmountPointer, EMPTY_POINTER);
    private readonly feeRecipient: StoredAddress = new StoredAddress(this._feeRecipientPointer);
    private readonly totalVaults: StoredU256 = new StoredU256(this._totalVaultsPointer, EMPTY_POINTER);

    public constructor() {
        super();
    }

    // ── Deployment ────────────────────────────────────────────────────────────
    public override onDeployment(_calldata: Calldata): void {
        this.nextVaultId.set(u256.One); // vault IDs start at 1
        this.feeAmount.set(DEFAULT_FEE);
        this.feeRecipient.value = Blockchain.tx.sender;
        this.totalVaults.set(u256.Zero);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Convert Address (Uint8Array) to u256 for storage */
    private addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    /** Verify that tx.sender is the owner of the given vault */
    private requireVaultOwner(vaultId: u256): void {
        const storedOwner: u256 = this.vaultOwner.get(vaultId);
        const sender: u256 = this.addressToU256(Blockchain.tx.sender);
        if (storedOwner != sender) {
            throw new Revert('Not the vault owner');
        }
    }

    /** Verify vault is in an expected status */
    private requireVaultStatus(vaultId: u256, expected: u256): void {
        const st: u256 = this.vaultStatus.get(vaultId);
        if (st != expected) {
            throw new Revert('Unexpected vault status');
        }
    }

    /** Blocks elapsed since last heartbeat, clamped to 0 if clock is weird */
    private elapsedSince(lastBeat: u64): u64 {
        const current: u64 = Blockchain.block.number;
        return current >= lastBeat ? current - lastBeat : u64(0);
    }

    /** Recalculate tier split from a new total deposited amount */
    private recalcTiers(vaultId: u256, newTotal: u256): void {
        const t1: u256 = SafeMath.div(SafeMath.mul(newTotal, TIER_1_BPS), BPS_DENOMINATOR);
        const t2: u256 = SafeMath.sub(newTotal, t1);
        this.vaultTier1Amt.set(vaultId, t1);
        this.vaultTier2Amt.set(vaultId, t2);
    }

    // ── Create Vault ──────────────────────────────────────────────────────────
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    private _createVault(calldata: Calldata): BytesWriter {
        const owner: Address = Blockchain.tx.sender;
        const ownerU256: u256 = this.addressToU256(owner);

        const beneficiary: Address = calldata.readAddress();
        if (beneficiary.isZero()) {
            throw new Revert('Beneficiary cannot be zero address');
        }
        if (beneficiary == owner) {
            throw new Revert('Beneficiary must differ from owner');
        }

        // Allocate vault ID
        const vaultId: u256 = this.nextVaultId.value;
        this.nextVaultId.set(SafeMath.add(vaultId, u256.One));

        // Store vault data
        this.vaultOwner.set(vaultId, ownerU256);
        this.vaultBeneficiary.set(vaultId, this.addressToU256(beneficiary));
        this.vaultStatus.set(vaultId, STATUS_ACTIVE);
        this.vaultHeartbeat.set(vaultId, u256.fromU64(Blockchain.block.number));
        this.vaultDeposited.set(vaultId, u256.Zero);
        this.vaultTier1Amt.set(vaultId, u256.Zero);
        this.vaultTier2Amt.set(vaultId, u256.Zero);

        // Index: ownerVaults[owner][count] = vaultId
        const count: u256 = this.ownerVaultCount.get(owner);
        this.ownerVaults.get(owner).set(count.toUint8Array(true), vaultId);
        this.ownerVaultCount.set(owner, SafeMath.add(count, u256.One));

        // Increment global vault counter
        this.totalVaults.set(SafeMath.add(this.totalVaults.value, u256.One));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(vaultId);
        return writer;
    }

    // ── Check-In (Heartbeat Reset) ────────────────────────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _checkIn(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        this.requireVaultOwner(vaultId);
        this.requireVaultStatus(vaultId, STATUS_ACTIVE);

        this.vaultHeartbeat.set(vaultId, u256.fromU64(Blockchain.block.number));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Deposit ───────────────────────────────────────────────────────────────
    @method(
        { name: 'vaultId', type: ABIDataTypes.UINT256 },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _deposit(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const amount: u256 = calldata.readU256();

        this.requireVaultOwner(vaultId);
        this.requireVaultStatus(vaultId, STATUS_ACTIVE);

        if (amount == u256.Zero) {
            throw new Revert('Deposit amount must be greater than zero');
        }

        const newTotal: u256 = SafeMath.add(this.vaultDeposited.get(vaultId), amount);
        this.vaultDeposited.set(vaultId, newTotal);
        this.recalcTiers(vaultId, newTotal);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Set Beneficiary ───────────────────────────────────────────────────────
    @method(
        { name: 'vaultId', type: ABIDataTypes.UINT256 },
        { name: 'newBeneficiary', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _setBeneficiary(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const newBeneficiary: Address = calldata.readAddress();

        this.requireVaultOwner(vaultId);
        this.requireVaultStatus(vaultId, STATUS_ACTIVE);

        if (newBeneficiary.isZero()) {
            throw new Revert('Beneficiary cannot be zero address');
        }

        const ownerU256: u256 = this.vaultOwner.get(vaultId);
        const benefU256: u256 = this.addressToU256(newBeneficiary);
        if (benefU256 == ownerU256) {
            throw new Revert('Beneficiary must differ from owner');
        }

        this.vaultBeneficiary.set(vaultId, benefU256);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Trigger Tier 1 (10% after ~6 months) ─────────────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'releasedAmount', type: ABIDataTypes.UINT256 })
    private _triggerTier1(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();

        this.requireVaultStatus(vaultId, STATUS_ACTIVE);

        const lastBeat: u64 = this.vaultHeartbeat.get(vaultId).lo1;
        const elapsed: u64 = this.elapsedSince(lastBeat);
        if (elapsed < TIER_1_BLOCKS) {
            throw new Revert('Tier 1 timeout not yet reached');
        }

        this.vaultStatus.set(vaultId, STATUS_TIER1_RELEASED);

        const amount: u256 = this.vaultTier1Amt.get(vaultId);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(amount);
        return writer;
    }

    // ── Trigger Tier 2 (90% after ~12 months) ────────────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'releasedAmount', type: ABIDataTypes.UINT256 })
    private _triggerTier2(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();

        this.requireVaultStatus(vaultId, STATUS_TIER1_RELEASED);

        const lastBeat: u64 = this.vaultHeartbeat.get(vaultId).lo1;
        const elapsed: u64 = this.elapsedSince(lastBeat);
        if (elapsed < TIER_2_BLOCKS) {
            throw new Revert('Tier 2 timeout not yet reached');
        }

        this.vaultStatus.set(vaultId, STATUS_FINALIZED);

        const amount: u256 = this.vaultTier2Amt.get(vaultId);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(amount);
        return writer;
    }

    // ── View: Get Vault Status ────────────────────────────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'currentStatus', type: ABIDataTypes.UINT256 },
        { name: 'lastHeartbeatBlock', type: ABIDataTypes.UINT64 },
        { name: 'currentBlock', type: ABIDataTypes.UINT64 },
        { name: 'totalDeposited', type: ABIDataTypes.UINT256 },
        { name: 'tier1Amount', type: ABIDataTypes.UINT256 },
        { name: 'tier2Amount', type: ABIDataTypes.UINT256 },
        { name: 'tier1BlocksRemaining', type: ABIDataTypes.UINT64 },
        { name: 'tier2BlocksRemaining', type: ABIDataTypes.UINT64 },
        { name: 'owner', type: ABIDataTypes.UINT256 },
    )
    private _getStatus(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();

        const currentStatus: u256 = this.vaultStatus.get(vaultId);
        const lastBeat: u64 = this.vaultHeartbeat.get(vaultId).lo1;
        const currentBlock: u64 = Blockchain.block.number;
        const totalDeposited: u256 = this.vaultDeposited.get(vaultId);
        const t1Amount: u256 = this.vaultTier1Amt.get(vaultId);
        const t2Amount: u256 = this.vaultTier2Amt.get(vaultId);
        const ownerVal: u256 = this.vaultOwner.get(vaultId);

        const elapsed: u64 = currentBlock >= lastBeat ? currentBlock - lastBeat : u64(0);

        let tier1Remaining: u64 = 0;
        if (elapsed < TIER_1_BLOCKS) {
            tier1Remaining = TIER_1_BLOCKS - elapsed;
        }

        let tier2Remaining: u64 = 0;
        if (elapsed < TIER_2_BLOCKS) {
            tier2Remaining = TIER_2_BLOCKS - elapsed;
        }

        // 32 + 8 + 8 + 32 + 32 + 32 + 8 + 8 + 32 = 192 bytes
        const writer: BytesWriter = new BytesWriter(192);
        writer.writeU256(currentStatus);
        writer.writeU64(lastBeat);
        writer.writeU64(currentBlock);
        writer.writeU256(totalDeposited);
        writer.writeU256(t1Amount);
        writer.writeU256(t2Amount);
        writer.writeU64(tier1Remaining);
        writer.writeU64(tier2Remaining);
        writer.writeU256(ownerVal);
        return writer;
    }

    // ── View: Has Vault (checks if a vaultId exists) ─────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'exists', type: ABIDataTypes.BOOL })
    private _hasVault(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const exists: bool = this.vaultStatus.get(vaultId) != STATUS_UNINITIALIZED;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(exists);
        return writer;
    }

    // ── View: Get Beneficiary ─────────────────────────────────────────────────
    @method({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'beneficiary', type: ABIDataTypes.UINT256 })
    private _getBeneficiary(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const benefVal: u256 = this.vaultBeneficiary.get(vaultId);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(benefVal);
        return writer;
    }

    // ── View: Get Vault Count for Owner ───────────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    private _getVaultCount(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const count: u256 = this.ownerVaultCount.get(owner);

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(count);
        return writer;
    }

    // ── View: Get Vault ID by Index ───────────────────────────────────────────
    @method(
        { name: 'owner', type: ABIDataTypes.ADDRESS },
        { name: 'index', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    private _getVaultIdByIndex(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const index: u256 = calldata.readU256();

        const count: u256 = this.ownerVaultCount.get(owner);
        if (index >= count) {
            throw new Revert('Vault index out of bounds');
        }

        const vaultId: u256 = this.ownerVaults.get(owner).get(index.toUint8Array(true));

        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(vaultId);
        return writer;
    }

    // ── View: Get Platform Fee ────────────────────────────────────────────────
    @method()
    @returns({ name: 'fee', type: ABIDataTypes.UINT256 })
    private _getFeeAmount(_calldata: Calldata): BytesWriter {
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(this.feeAmount.value);
        return writer;
    }
}
