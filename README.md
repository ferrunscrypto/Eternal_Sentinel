# Eternal Sentinel — Sovereign Trust Protocol

A decentralized Dead Man's Switch with Progressive Inheritance on Bitcoin L1, powered by [OPNet](https://opnet.org).

## Concept

Eternal Sentinel is a smart contract that acts as a **Sovereign Trust** — protecting Bitcoin legacies without lawyers, intermediaries, or centralized services. Instead of a simple all-or-nothing transfer, it uses a **Progressive Inheritance Ladder** that releases funds in controlled stages.

## How It Works

### The Heartbeat
The vault owner periodically "checks in" to prove they are still alive and in control. Each check-in resets the countdown timer measured in Bitcoin blocks.

### The Inheritance Ladder

| Tier | Trigger | Release | Purpose |
|------|---------|---------|---------|
| **Tier 1** | 6 months of silence (~26,280 blocks) | 10% of vault | Immediate family expenses |
| **Tier 2** | 12 months of silence (~52,560 blocks) | Remaining 90% | Full inheritance transfer |

### Security
- Only the vault owner can reset the heartbeat timer
- Beneficiary addresses are set and updateable by the owner while the vault is active
- Once Tier 2 is released, the vault finalizes permanently
- No unbounded loops — all operations are O(1)
- ML-DSA (quantum-resistant) signatures via OPNet

## Live Deployment

| Network | Contract Address |
|---------|-----------------|
| OPNet Testnet | *(deploy via `npm run deploy` in `/contract`)* |

## Project Structure

```
Eternal_Sentinel/
├── contract/                    # OPNet Smart Contract (AssemblyScript)
│   ├── src/
│   │   ├── index.ts             # Entry point
│   │   └── EternalSentinel.ts  # Contract logic
│   ├── tests/                   # Vitest unit tests
│   ├── patches/                 # btc-runtime patch (OPNet testnet chain ID)
│   ├── asconfig.json
│   ├── deploy.mjs               # Deployment script
│   └── package.json
│
└── frontend-legacy/             # React Dashboard (Vite + TypeScript)
    ├── src/
    │   ├── components/          # React UI components
    │   ├── hooks/               # useSentinel hook
    │   ├── services/            # Provider & Contract caching
    │   ├── types/               # TypeScript interfaces
    │   ├── config/              # Network & contract addresses
    │   ├── abi/                 # Contract ABI definition
    │   ├── App.tsx
    │   ├── main.tsx
    │   └── index.css
    ├── tests/                   # Component tests
    ├── vite.config.ts
    └── package.json
```

## Quick Start

### Contract

```bash
cd contract
npm install
npm run build       # Compile AssemblyScript → WASM
npm test            # Run unit tests
node deploy.mjs     # Deploy to OPNet testnet
```

### Frontend

```bash
cd frontend-legacy
npm install
npm run dev         # Start dev server (http://localhost:5182)
npm test            # Run component tests
```

## Contract Methods

| Method | Access | Description |
|--------|--------|-------------|
| `_createVault(beneficiary)` | Anyone (once per address) | Create a vault; caller becomes owner |
| `_checkIn()` | Owner | Reset the heartbeat timer |
| `_deposit(amount)` | Owner | Record a deposit; recalculates tier splits |
| `_setBeneficiary(address)` | Owner | Update beneficiary address |
| `_triggerTier1(owner)` | Anyone | Release 10% after 6-month timeout |
| `_triggerTier2(owner)` | Anyone | Release 90% after 12-month timeout |
| `_getStatus(owner)` | View | Full vault status with block countdowns |
| `_hasVault(address)` | View | Check if an address has a vault |

## Technology

- **Smart Contract**: AssemblyScript → WASM on OPNet (Bitcoin L1)
- **Frontend**: React 18 + Vite + TypeScript
- **Wallet**: OP_WALLET via `@btc-vision/walletconnect`
- **RPC**: OPNet JSON-RPC provider (`https://testnet.opnet.org`)
- **Signatures**: ML-DSA (quantum-resistant)

## License

MIT
