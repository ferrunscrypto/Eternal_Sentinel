import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { EternalSentinel } from './EternalSentinel';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// Factory function - REQUIRED
Blockchain.contract = (): EternalSentinel => {
    return new EternalSentinel();
};

// Runtime exports - REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler - REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
