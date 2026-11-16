// Sandboxed JavaScript for card/preset code (EJS templates). Runs in QuickJS (WebAssembly): no
// file system, network, process or require — only the host functions passed in, with memory and
// time limits.

import variant from '@jitl/quickjs-singlefile-mjs-release-sync';
import { newQuickJSWASMModuleFromVariant, shouldInterruptAfterDeadline, type QuickJSHandle, type QuickJSWASMModule } from 'quickjs-emscripten-core';

let modulePromise: Promise<QuickJSWASMModule> | null = null;

function quickjs(): Promise<QuickJSWASMModule> {
    return modulePromise ??= newQuickJSWASMModuleFromVariant(variant);
}

export type HostCall = (name: string, args: unknown[]) => unknown;

/** Evaluates `code` (an expression yielding a value or promise) and returns its JSON-able result. */
export async function runSandboxed(code: string, host: HostCall, timeoutMs = 2000): Promise<unknown> {
    const QuickJS = await quickjs();
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(64 * 1024 * 1024);
    runtime.setMaxStackSize(1024 * 1024);
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + timeoutMs));
    const vm = runtime.newContext();
    try {
        const bridge = vm.newFunction('__host', (nameH: QuickJSHandle, argsH: QuickJSHandle) => {
            const name = vm.getString(nameH);
            const args = JSON.parse(vm.getString(argsH) || '[]');
            const out = host(name, args);
            return out === undefined ? vm.undefined : vm.newString(JSON.stringify(out));
        });
        vm.setProp(vm.global, '__host', bridge);
        bridge.dispose();
        const result = vm.evalCode(code, 'template.js');
        if (result.error) {
            const err = vm.dump(result.error) as { message?: string } | string;
            result.error.dispose();
            throw new Error(typeof err === 'string' ? err : err?.message ?? '模板执行出错');
        }
        const settledPromise = vm.resolvePromise(result.value);
        result.value.dispose();
        runtime.executePendingJobs();
        const settled = await settledPromise;
        if (settled.error) {
            const err = vm.dump(settled.error) as { message?: string } | string;
            settled.error.dispose();
            throw new Error(typeof err === 'string' ? err : err?.message ?? '模板执行出错');
        }
        const value = vm.dump(settled.value);
        settled.value.dispose();
        return value;
    } finally {
        vm.dispose();
        runtime.dispose();
    }
}
