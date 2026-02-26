/**
 * Eternal Sentinel — Contract Deployment Script
 *
 * Deploys EternalSentinel.wasm to OPNet testnet.
 *
 * Usage:
 *   1. Make sure contract/.env has:  MNEMONIC=your twelve word phrase ...
 *   2. node deploy.mjs
 *
 * After success, update frontend/src/config/contracts.ts with the printed address.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env from contract/.env ──────────────────────────────────────────────

const envPath = resolve(__dirname, 'contract', '.env');
try {
    const envContent = readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!(key in process.env)) process.env[key] = val;
    }
} catch {
    // .env not found — env vars must already be set
}

// ── Resolve node_modules from frontend ───────────────────────────────────────
// The frontend already has opnet, @btc-vision/transaction, @btc-vision/bitcoin installed.

const require = createRequire(resolve(__dirname, 'frontend', 'package.json'));
const nodeModulesBase = resolve(__dirname, 'frontend', 'node_modules');

const { JSONRpcProvider } = await import(resolve(nodeModulesBase, 'opnet', 'build', 'index.js'));
const { TransactionFactory, Mnemonic, AddressTypes } = await import(
    resolve(nodeModulesBase, '@btc-vision', 'transaction', 'build', 'index.js')
);
const { networks } = await import(
    resolve(nodeModulesBase, '@btc-vision', 'bitcoin', 'build', 'index.js')
);

// ── Config ────────────────────────────────────────────────────────────────────

const MNEMONIC_PHRASE = process.env.MNEMONIC ?? '';
if (!MNEMONIC_PHRASE) {
    console.error('ERROR: MNEMONIC not set in contract/.env');
    process.exit(1);
}

const NETWORK  = networks.opnetTestnet;
const RPC_URL  = 'https://testnet.opnet.org';
const FEE_RATE = 10;           // sat/vbyte
const GAS_FEE  = 100_000n;     // sat

// ── Load WASM ─────────────────────────────────────────────────────────────────

const wasmPath = join(__dirname, 'contract', 'build', 'EternalSentinel.wasm');
const bytecode = new Uint8Array(readFileSync(wasmPath));
console.log(`WASM loaded: ${bytecode.length} bytes`);

// ── Derive wallet ─────────────────────────────────────────────────────────────

const mnemonic = new Mnemonic(MNEMONIC_PHRASE, '', NETWORK);
const wallet   = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0, false);
console.log(`Deployer address: ${wallet.p2tr}`);

// ── Provider ──────────────────────────────────────────────────────────────────

const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

// ── UTXOs ─────────────────────────────────────────────────────────────────────

console.log('Fetching UTXOs...');
const utxos = await provider.utxoManager.getUTXOs({
    address:          wallet.p2tr,
    optimize:         true,
    mergePendingUTXOs: true,
    filterSpentUTXOs: true,
});

if (!utxos || utxos.length === 0) {
    console.error('No UTXOs found. Fund the deployer address first:');
    console.error(`  https://faucet.opnet.org`);
    console.error(`  Address: ${wallet.p2tr}`);
    process.exit(1);
}
const totalSats = utxos.reduce((s, u) => s + u.value, 0n);
console.log(`UTXOs: ${utxos.length}, total: ${totalSats} sats`);

// ── Challenge ─────────────────────────────────────────────────────────────────

console.log('Fetching challenge...');
const challenge = await provider.getChallenge();
console.log(`Challenge epoch: ${challenge.epochNumber}`);

// ── Sign deployment ───────────────────────────────────────────────────────────

console.log('Signing deployment...');
const factory = new TransactionFactory();
const deployment = await factory.signDeployment({
    from:                        wallet.p2tr,
    utxos,
    signer:                      wallet.keypair,
    mldsaSigner:                 wallet.mldsaKeypair,
    network:                     NETWORK,
    bytecode,
    calldata:                    new Uint8Array(0),
    challenge,
    feeRate:                     FEE_RATE,
    priorityFee:                 0n,
    gasSatFee:                   GAS_FEE,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey:        true,
});

console.log(`\nContract address: ${deployment.contractAddress}`);

// ── Broadcast ─────────────────────────────────────────────────────────────────

console.log('\nBroadcasting funding tx...');
const fundingResult = await provider.sendRawTransaction(deployment.transaction[0], false);
console.log('Funding tx:', JSON.stringify(fundingResult));

if (!fundingResult.success) {
    console.error('Funding transaction failed:', fundingResult.error);
    process.exit(1);
}

console.log('\nWaiting 15s for funding tx to propagate...');
await new Promise(r => setTimeout(r, 15_000));

console.log('Broadcasting deployment tx...');
let deployResult;
for (let attempt = 1; attempt <= 5; attempt++) {
    deployResult = await provider.sendRawTransaction(deployment.transaction[1], false);
    console.log(`Attempt ${attempt}:`, JSON.stringify(deployResult));
    if (deployResult.success) break;
    if (attempt < 5) {
        console.log('Retrying in 10s...');
        await new Promise(r => setTimeout(r, 10_000));
    }
}

if (!deployResult?.success) {
    console.error('Deployment failed after retries.');
    process.exit(1);
}

// ── Done ──────────────────────────────────────────────────────────────────────

const fundTx   = fundingResult.result;
const deployTx = deployResult.result;

console.log('\n✅ Deployment successful!');
console.log(`Contract address : ${deployment.contractAddress}`);
console.log(`Funding tx       : https://mempool.opnet.org/testnet4/tx/${fundTx}`);
console.log(`Deploy tx        : https://mempool.opnet.org/testnet4/tx/${deployTx}`);
console.log('\nNext: update frontend/src/config/contracts.ts:');
console.log(`  ['testnet', { sentinel: '${deployment.contractAddress}' }]`);
