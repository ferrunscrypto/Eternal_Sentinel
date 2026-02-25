/**
 * EternalSentinel Contract Deployment Script
 *
 * Deploys EternalSentinel.wasm to OPNet testnet.
 * Usage: node deploy.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Dynamic imports (ESM) ─────────────────────────────────────────────────────

const { JSONRpcProvider } = await import('opnet');
const { TransactionFactory, Mnemonic, AddressTypes } = await import('@btc-vision/transaction');
const { networks } = await import('@btc-vision/bitcoin');

// ── Config ────────────────────────────────────────────────────────────────────

const MNEMONIC_PHRASE = process.env.MNEMONIC ?? '';
const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

// Fee parameters (adjust if needed)
const FEE_RATE = 25;          // sat/vbyte
const PRIORITY_FEE = 1000n;   // sat
const GAS_SAT_FEE = 5000n;    // sat

// ── Load WASM ─────────────────────────────────────────────────────────────────

const wasmPath = join(__dirname, 'build', 'EternalSentinel.wasm');
const bytecode = readFileSync(wasmPath);
const bytecodeUint8 = new Uint8Array(bytecode);

console.log(`WASM size: ${bytecodeUint8.length} bytes`);

// ── Derive Wallet ─────────────────────────────────────────────────────────────

console.log('Deriving wallet from mnemonic...');
const mnemonic = new Mnemonic(MNEMONIC_PHRASE, '', NETWORK);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0, 0, false);

const fromAddress = wallet.p2tr;
console.log(`Deployer address: ${fromAddress}`);

// ── Connect to Provider ───────────────────────────────────────────────────────

console.log(`Connecting to ${RPC_URL}...`);
const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

// ── Fetch Challenge ───────────────────────────────────────────────────────────

console.log('Fetching challenge...');
const challenge = await provider.getChallenge();
console.log(`Challenge epoch: ${challenge.epochNumber}`);

// ── Fetch UTXOs ───────────────────────────────────────────────────────────────

console.log(`Fetching UTXOs for ${fromAddress}...`);
const utxos = await provider.utxoManager.getUTXOs({
    address: fromAddress,
    optimize: true,
    mergePendingUTXOs: true,
    filterSpentUTXOs: true,
});

if (!utxos || utxos.length === 0) {
    console.error('No UTXOs found. Please fund the deployer address first.');
    console.error(`Faucet: https://faucet.opnet.org`);
    console.error(`Address: ${fromAddress}`);
    process.exit(1);
}

const totalBalance = utxos.reduce((sum, u) => sum + u.value, 0n);
console.log(`Found ${utxos.length} UTXO(s), total: ${totalBalance} sats`);

// ── Sign Deployment ───────────────────────────────────────────────────────────

console.log('Signing deployment transaction...');
const factory = new TransactionFactory();

const deploymentParams = {
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: NETWORK,
    bytecode: bytecodeUint8,
    challenge,
    utxos,
    from: fromAddress,
    feeRate: FEE_RATE,
    priorityFee: PRIORITY_FEE,
    gasSatFee: GAS_SAT_FEE,
};

const result = await factory.signDeployment(deploymentParams);

console.log(`\nContract address: ${result.contractAddress}`);
console.log(`Contract pubkey:  ${result.contractPubKey}`);

// ── Broadcast ─────────────────────────────────────────────────────────────────

console.log('\nBroadcasting funding transaction...');
const fundingResult = await provider.sendRawTransaction(result.transaction[0], false);
console.log('Funding tx broadcast:', JSON.stringify(fundingResult));

if (!fundingResult.success) {
    console.error('Funding transaction failed:', fundingResult.error);
    process.exit(1);
}

// Wait for funding tx to propagate through the mempool
console.log('\nWaiting 15 seconds for funding tx to propagate...');
await new Promise(resolve => setTimeout(resolve, 15000));

console.log('Broadcasting deployment transaction...');
let deployResult;
for (let attempt = 1; attempt <= 5; attempt++) {
    deployResult = await provider.sendRawTransaction(result.transaction[1], false);
    console.log(`Deploy attempt ${attempt}:`, JSON.stringify(deployResult));
    if (deployResult.success) break;
    if (attempt < 5) {
        console.log(`Retrying in 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

if (!deployResult.success) {
    console.error('Deployment transaction failed after retries:', deployResult.error);
    process.exit(1);
}

// ── Done ──────────────────────────────────────────────────────────────────────

const fundingTxId = fundingResult.result ?? result.transaction[0].slice(0, 64);
const deployTxId = deployResult.result ?? result.transaction[1].slice(0, 64);

console.log('\n✅ Deployment successful!');
console.log(`Contract address : ${result.contractAddress}`);
console.log(`Funding tx       : https://mempool.opnet.org/testnet4/tx/${fundingTxId}`);
console.log(`Deploy tx        : https://mempool.opnet.org/testnet4/tx/${deployTxId}`);
console.log('\nUpdate frontend-legacy/src/config/contracts.ts with the contract address above.');
