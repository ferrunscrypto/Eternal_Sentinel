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
import { AddressMemoryMap } from '@btc-vision/btc-runtime/runtime/memory/AddressMemoryMap';

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
 * Any address can create its own isolated vault.
 * Ownership is derived from Blockchain.tx.sender — no address spoofing possible.
 *
 * Architecture
 * ────────────
 *  • Each vault is identified by the owner's address (stored as key in all per-vault maps).
 *  • Six AddressMemoryMap instances store per-vault state.
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
    private readonly _statusPointer: u16 = Blockchain.nextPointer;
    private readonly _heartbeatPointer: u16 = Blockchain.nextPointer;
    private readonly _depositedPointer: u16 = Blockchain.nextPointer;
    private readonly _tier1AmtPointer: u16 = Blockchain.nextPointer;
    private readonly _tier2AmtPointer: u16 = Blockchain.nextPointer;
    private readonly _beneficiaryPointer: u16 = Blockchain.nextPointer;
    private readonly _feeAmountPointer: u16 = Blockchain.nextPointer;
    private readonly _feeRecipientPointer: u16 = Blockchain.nextPointer;
    private readonly _totalVaultsPointer: u16 = Blockchain.nextPointer;

    // ── Per-vault maps (key = vault owner's Address) ──────────────────────────
    /** Vault lifecycle status: 0=none, 1=active, 2=tier1_released, 3=finalized */
    private readonly vaultStatus: AddressMemoryMap = new AddressMemoryMap(this._statusPointer);
    /** Block number of last check-in (or vault creation), stored as u256 */
    private readonly vaultHeartbeat: AddressMemoryMap = new AddressMemoryMap(this._heartbeatPointer);
    /** Cumulative BTC deposited (satoshis) */
    private readonly vaultDeposited: AddressMemoryMap = new AddressMemoryMap(this._depositedPointer);
    /** 10% tier-1 entitlement */
    private readonly vaultTier1Amt: AddressMemoryMap = new AddressMemoryMap(this._tier1AmtPointer);
    /** 90% tier-2 entitlement */
    private readonly vaultTier2Amt: AddressMemoryMap = new AddressMemoryMap(this._tier2AmtPointer);
    /**
     * Beneficiary address stored as raw bytes (Address extends Uint8Array).
     * Use setAsUint8Array / getAsUint8Array for storing 32-byte addresses.
     */
    private readonly vaultBeneficiary: AddressMemoryMap = new AddressMemoryMap(this._beneficiaryPointer);

    // ── Global platform state ─────────────────────────────────────────────────
    private readonly feeAmount: StoredU256 = new StoredU256(this._feeAmountPointer, EMPTY_POINTER);
    private readonly feeRecipient: StoredAddress = new StoredAddress(this._feeRecipientPointer);
    private readonly totalVaults: StoredU256 = new StoredU256(this._totalVaultsPointer, EMPTY_POINTER);

    // ── Selectors are generated automatically by @method decorators + opnet-transform ──
    // Do NOT define manual encodeSelector fields here — the transform generates the
    // execute() dispatcher using the decorated method names (with underscore prefix).
    // Manual selectors computed without the underscore would produce different 4-byte
    // hashes and would be overwritten at build time anyway.

    public constructor() {
        super();
    }

    // ── Deployment ────────────────────────────────────────────────────────────
    public override onDeployment(_calldata: Calldata): void {
        this.feeAmount.set(DEFAULT_FEE);
        this.feeRecipient.value = Blockchain.tx.sender;
        this.totalVaults.set(u256.Zero);
    }

    // ── Router ────────────────────────────────────────────────────────────────
    // The execute() dispatcher is auto-generated by opnet-transform at build time
    // from the @method decorators on each private method. Do NOT write it manually
    // here — the transform overwrites any manually written execute() and uses the
    // decorated method names (with the underscore prefix) to compute selectors.
    // This ensures the on-chain selector hash always matches the ABI JSON and
    // the frontend ABI which also use the underscore-prefixed names.

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Read vault status for a given owner */
    private statusOf(owner: Address): u256 {
        return this.vaultStatus.get(owner);
    }

    /** Read heartbeat block for a given owner */
    private heartbeatOf(owner: Address): u64 {
        // block numbers fit in u64; stored as u256, read via .lo1
        return this.vaultHeartbeat.get(owner).lo1;
    }

    /** Ensure caller (Blockchain.tx.sender) has an active vault, return the sender */
    private requireActiveVault(): Address {
        const sender: Address = Blockchain.tx.sender;
        const st: u256 = this.statusOf(sender);
        if (st != STATUS_ACTIVE) {
            throw new Revert('No active vault for sender');
        }
        return sender;
    }

    /** Blocks elapsed since last heartbeat, clamped to 0 if clock is weird */
    private elapsedSince(lastBeat: u64): u64 {
        const current: u64 = Blockchain.block.number;
        return current >= lastBeat ? current - lastBeat : u64(0);
    }

    /** Recalculate tier split from a new total deposited amount */
    private recalcTiers(owner: Address, newTotal: u256): void {
        const t1: u256 = SafeMath.div(SafeMath.mul(newTotal, TIER_1_BPS), BPS_DENOMINATOR);
        const t2: u256 = SafeMath.sub(newTotal, t1);
        this.vaultTier1Amt.set(owner, t1);
        this.vaultTier2Amt.set(owner, t2);
    }

    // ── Create Vault ──────────────────────────────────────────────────────────
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _createVault(calldata: Calldata): BytesWriter {
        const owner: Address = Blockchain.tx.sender;

        // Each address may hold only one vault
        if (this.statusOf(owner) != STATUS_UNINITIALIZED) {
            throw new Revert('Vault already exists for this address');
        }

        const beneficiary: Address = calldata.readAddress();
        if (beneficiary.isZero()) {
            throw new Revert('Beneficiary cannot be zero address');
        }
        if (beneficiary == owner) {
            throw new Revert('Beneficiary must differ from owner');
        }

        // Initialise vault state
        this.vaultStatus.set(owner, STATUS_ACTIVE);
        this.vaultHeartbeat.set(owner, u256.fromU64(Blockchain.block.number));
        this.vaultDeposited.set(owner, u256.Zero);
        this.vaultTier1Amt.set(owner, u256.Zero);
        this.vaultTier2Amt.set(owner, u256.Zero);
        // Store beneficiary address as raw 32-byte value
        this.vaultBeneficiary.setAsUint8Array(owner, beneficiary);

        // Increment vault counter
        this.totalVaults.set(SafeMath.add(this.totalVaults.value, u256.One));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Check-In (Heartbeat Reset) ────────────────────────────────────────────
    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _checkIn(_calldata: Calldata): BytesWriter {
        const owner: Address = this.requireActiveVault();

        this.vaultHeartbeat.set(owner, u256.fromU64(Blockchain.block.number));

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Deposit ───────────────────────────────────────────────────────────────
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _deposit(calldata: Calldata): BytesWriter {
        const owner: Address = this.requireActiveVault();

        const amount: u256 = calldata.readU256();
        if (amount == u256.Zero) {
            throw new Revert('Deposit amount must be greater than zero');
        }

        const newTotal: u256 = SafeMath.add(this.vaultDeposited.get(owner), amount);
        this.vaultDeposited.set(owner, newTotal);
        this.recalcTiers(owner, newTotal);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Set Beneficiary ───────────────────────────────────────────────────────
    @method({ name: 'newBeneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private _setBeneficiary(calldata: Calldata): BytesWriter {
        const owner: Address = this.requireActiveVault();

        const newBeneficiary: Address = calldata.readAddress();
        if (newBeneficiary.isZero()) {
            throw new Revert('Beneficiary cannot be zero address');
        }
        if (newBeneficiary == owner) {
            throw new Revert('Beneficiary must differ from owner');
        }

        this.vaultBeneficiary.setAsUint8Array(owner, newBeneficiary);

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── Trigger Tier 1 (10% after ~6 months) ─────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'releasedAmount', type: ABIDataTypes.UINT256 })
    private _triggerTier1(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();

        if (this.statusOf(owner) != STATUS_ACTIVE) {
            throw new Revert('Vault not in active state');
        }

        const elapsed: u64 = this.elapsedSince(this.heartbeatOf(owner));
        if (elapsed < TIER_1_BLOCKS) {
            throw new Revert('Tier 1 timeout not yet reached');
        }

        this.vaultStatus.set(owner, STATUS_TIER1_RELEASED);

        const amount: u256 = this.vaultTier1Amt.get(owner);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(amount);
        return writer;
    }

    // ── Trigger Tier 2 (90% after ~12 months) ────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'releasedAmount', type: ABIDataTypes.UINT256 })
    private _triggerTier2(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();

        if (this.statusOf(owner) != STATUS_TIER1_RELEASED) {
            throw new Revert('Tier 1 must be released first');
        }

        const elapsed: u64 = this.elapsedSince(this.heartbeatOf(owner));
        if (elapsed < TIER_2_BLOCKS) {
            throw new Revert('Tier 2 timeout not yet reached');
        }

        this.vaultStatus.set(owner, STATUS_FINALIZED);

        const amount: u256 = this.vaultTier2Amt.get(owner);
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeU256(amount);
        return writer;
    }

    // ── View: Get Vault Status ────────────────────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'currentStatus', type: ABIDataTypes.UINT256 },
        { name: 'lastHeartbeatBlock', type: ABIDataTypes.UINT64 },
        { name: 'currentBlock', type: ABIDataTypes.UINT64 },
        { name: 'totalDeposited', type: ABIDataTypes.UINT256 },
        { name: 'tier1Amount', type: ABIDataTypes.UINT256 },
        { name: 'tier2Amount', type: ABIDataTypes.UINT256 },
        { name: 'tier1BlocksRemaining', type: ABIDataTypes.UINT64 },
        { name: 'tier2BlocksRemaining', type: ABIDataTypes.UINT64 },
    )
    private _getStatus(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();

        const currentStatus: u256 = this.statusOf(owner);
        const lastBeat: u64 = this.heartbeatOf(owner);
        const currentBlock: u64 = Blockchain.block.number;
        const totalDeposited: u256 = this.vaultDeposited.get(owner);
        const t1Amount: u256 = this.vaultTier1Amt.get(owner);
        const t2Amount: u256 = this.vaultTier2Amt.get(owner);

        const elapsed: u64 = currentBlock >= lastBeat ? currentBlock - lastBeat : u64(0);

        let tier1Remaining: u64 = 0;
        if (elapsed < TIER_1_BLOCKS) {
            tier1Remaining = TIER_1_BLOCKS - elapsed;
        }

        let tier2Remaining: u64 = 0;
        if (elapsed < TIER_2_BLOCKS) {
            tier2Remaining = TIER_2_BLOCKS - elapsed;
        }

        // 32 + 8 + 8 + 32 + 32 + 32 + 8 + 8 = 160 bytes
        const writer: BytesWriter = new BytesWriter(160);
        writer.writeU256(currentStatus);
        writer.writeU64(lastBeat);
        writer.writeU64(currentBlock);
        writer.writeU256(totalDeposited);
        writer.writeU256(t1Amount);
        writer.writeU256(t2Amount);
        writer.writeU64(tier1Remaining);
        writer.writeU64(tier2Remaining);
        return writer;
    }

    // ── View: Get Beneficiary ─────────────────────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    private _getBeneficiary(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const benefBytes: Uint8Array = this.vaultBeneficiary.getAsUint8Array(owner);

        // 32 bytes for ADDRESS type
        const writer: BytesWriter = new BytesWriter(32);
        writer.writeBytes(benefBytes);
        return writer;
    }

    // ── View: Has Vault ───────────────────────────────────────────────────────
    @method({ name: 'owner', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'exists', type: ABIDataTypes.BOOL })
    private _hasVault(calldata: Calldata): BytesWriter {
        const owner: Address = calldata.readAddress();
        const exists: bool = this.statusOf(owner) != STATUS_UNINITIALIZED;

        const writer: BytesWriter = new BytesWriter(1);
        writer.writeBoolean(exists);
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
