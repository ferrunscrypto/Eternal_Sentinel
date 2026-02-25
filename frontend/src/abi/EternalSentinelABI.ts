import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

export const ETERNAL_SENTINEL_ABI: BitcoinInterfaceAbi = [
    // ── Write Methods ─────────────────────────────────────────
    {
        name: '_createVault',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_checkIn',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: '_setBeneficiary',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
            { name: 'newBeneficiary', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: '_deposit',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: '_triggerTier1',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'releasedAmount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_triggerTier2',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'releasedAmount', type: ABIDataTypes.UINT256 },
        ],
    },

    // ── Read Methods ──────────────────────────────────────────
    {
        name: '_getStatus',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'currentStatus', type: ABIDataTypes.UINT256 },
            { name: 'lastHeartbeatBlock', type: ABIDataTypes.UINT64 },
            { name: 'currentBlock', type: ABIDataTypes.UINT64 },
            { name: 'totalDeposited', type: ABIDataTypes.UINT256 },
            { name: 'tier1Amount', type: ABIDataTypes.UINT256 },
            { name: 'tier2Amount', type: ABIDataTypes.UINT256 },
            { name: 'tier1BlocksRemaining', type: ABIDataTypes.UINT64 },
            { name: 'tier2BlocksRemaining', type: ABIDataTypes.UINT64 },
            { name: 'owner', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_getBeneficiary',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'beneficiary', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_hasVault',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'exists', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: '_getVaultCount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'count', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_getVaultIdByIndex',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'index', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'vaultId', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: '_getFeeAmount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'fee', type: ABIDataTypes.UINT256 },
        ],
    },
];
